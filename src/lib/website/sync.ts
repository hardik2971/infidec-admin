import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import type { WebsiteOrder, WebsiteReader, WebsiteUser } from "./source";

/**
 * Imports website customers and orders into the admin.
 *
 * Rules:
 *  - The website is read-only; every write here goes to the admin project.
 *  - Customers are matched by email; existing admin data is never overwritten (only blanks are filled).
 *  - Each website order item becomes one admin order with a deterministic id, so re-running is safe.
 *  - The website does not yet verify payments with a gateway, so imported orders are always
 *    `pending / unverified`. Staff confirm payment and mark the order completed, which issues the license.
 *  - Orders already imported are not changed except for the mirrored website status.
 */

export interface SyncStats {
  websiteUsers: number;
  websiteOrders: number;
  customersCreated: number;
  customersLinked: number;
  ordersCreated: number;
  ordersUpdated: number;
  itemsSkipped: number;
  unmatchedSlugs: string[];
  warnings: string[];
}

const col = (name: keyof typeof COLLECTIONS) => adminDb.collection(COLLECTIONS[name]);
const safeId = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 100);
export const websiteOrderDocId = (orderId: string, index: number) => `web_${safeId(orderId)}_${index + 1}`;
const toMinor = (n: number) => Math.round(n * 100);
const ts = (iso: string | null) => (iso ? Timestamp.fromDate(new Date(iso)) : FieldValue.serverTimestamp());

async function productMap() {
  const snap = await col("products").select("slug", "source").get();
  const map = new Map<string, string>();
  for (const d of snap.docs) {
    const sourceSlug = d.get("source")?.sourceSlug;
    if (typeof sourceSlug === "string" && sourceSlug) map.set(sourceSlug, d.id);
    const slug = d.get("slug");
    if (typeof slug === "string" && slug && !map.has(slug)) map.set(slug, d.id);
  }
  return map;
}

function customerName(u: Pick<WebsiteUser, "firstName" | "lastName" | "email">) {
  return `${u.firstName} ${u.lastName}`.trim() || u.email.split("@")[0];
}

export async function runWebsiteSync(reader: WebsiteReader, opts: { actorId: string; dryRun?: boolean }): Promise<SyncStats> {
  const [users, orders, products, customerSnap] = await Promise.all([
    reader.users(),
    reader.orders(),
    productMap(),
    col("customers").select("email", "websiteUserId", "phone", "country", "company").get(),
  ]);
  const stats: SyncStats = {
    websiteUsers: users.length,
    websiteOrders: orders.length,
    customersCreated: 0,
    customersLinked: 0,
    ordersCreated: 0,
    ordersUpdated: 0,
    itemsSkipped: 0,
    unmatchedSlugs: [],
    warnings: [],
  };
  const writer = opts.dryRun ? null : adminDb.bulkWriter();
  const byEmail = new Map(customerSnap.docs.map((d) => [String(d.get("email") ?? "").toLowerCase(), d]));
  const customerIdByWebsiteUser = new Map<string, string>();
  const createdEmails = new Map<string, string>();

  // ----- customers -----
  const ensureCustomer = (u: WebsiteUser): string | null => {
    if (!u.email || !u.email.includes("@")) {
      stats.warnings.push(`Website user ${u.id} has no valid email — skipped.`);
      return null;
    }
    const existing = byEmail.get(u.email);
    if (existing) {
      if (u.id && existing.get("websiteUserId") !== u.id) {
        stats.customersLinked++;
        const fill: Record<string, unknown> = { websiteUserId: u.id, updatedAt: FieldValue.serverTimestamp() };
        if (!existing.get("phone") && u.phone) fill.phone = u.phone;
        if (!existing.get("country") && u.country) fill.country = u.country;
        if (!existing.get("company") && u.company) fill.company = u.company;
        writer?.update(existing.ref, fill);
      }
      return existing.id;
    }
    const prior = createdEmails.get(u.email);
    if (prior) return prior;
    const ref = u.id ? col("customers").doc(`web_${safeId(u.id)}`) : col("customers").doc();
    stats.customersCreated++;
    createdEmails.set(u.email, ref.id);
    writer?.set(
      ref,
      {
        name: customerName(u),
        email: u.email,
        phone: u.phone,
        country: u.country,
        company: u.company,
        marketplaceUsername: "",
        status: "active",
        productIds: [],
        uid: null,
        websiteUserId: u.id || null,
        source: "website",
        createdBy: opts.actorId,
        createdAt: ts(u.createdAt),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return ref.id;
  };

  for (const u of users) {
    const id = ensureCustomer(u);
    if (id) customerIdByWebsiteUser.set(u.id, id);
  }

  // ----- orders -----
  const existingOrders = new Map<string, FirebaseFirestore.DocumentSnapshot>();
  const ids = orders.flatMap((o) => o.items.map((_, i) => websiteOrderDocId(o.id, i)));
  for (let i = 0; i < ids.length; i += 300) {
    const refs = ids.slice(i, i + 300).map((id) => col("orders").doc(id));
    if (refs.length) for (const s of await adminDb.getAll(...refs)) if (s.exists) existingOrders.set(s.id, s);
  }

  const unmatched = new Set<string>();
  for (const o of orders) {
    let customerId = customerIdByWebsiteUser.get(o.userId) ?? null;
    if (!customerId && o.billing.email) {
      customerId = ensureCustomer({ id: "", firstName: o.billing.fullName, lastName: "", email: o.billing.email, phone: o.billing.phone, company: o.billing.company, country: o.billing.country, createdAt: o.createdAt });
    }
    if (!customerId) {
      stats.itemsSkipped += o.items.length;
      stats.warnings.push(`Order ${o.id}: no matching customer — skipped.`);
      continue;
    }
    o.items.forEach((item, index) => {
      const docId = websiteOrderDocId(o.id, index);
      const existing = existingOrders.get(docId);
      if (existing) {
        if (existing.get("websiteStatus") !== o.status) {
          stats.ordersUpdated++;
          writer?.update(existing.ref, { websiteStatus: o.status, websiteSyncedAt: FieldValue.serverTimestamp() });
        }
        return;
      }
      const productId = products.get(item.slug);
      if (!productId) {
        stats.itemsSkipped++;
        unmatched.add(item.slug || "(blank)");
        return;
      }
      stats.ordersCreated++;
      if (!writer) return;
      writer.set(col("orders").doc(docId), orderDoc(o, index, customerId, productId, opts.actorId));
      writer.update(col("customers").doc(customerId), { productIds: FieldValue.arrayUnion(productId), updatedAt: FieldValue.serverTimestamp() });
    });
  }
  stats.unmatchedSlugs = [...unmatched];
  await writer?.close();
  return stats;
}

function orderDoc(o: WebsiteOrder, index: number, customerId: string, productId: string, actorId: string) {
  const item = o.items[index];
  const multi = o.items.length > 1;
  const breakdown = [
    `License ${o.currency} ${item.licensePrice}`,
    item.planPrice ? `${item.planName || item.plan || "plan"} ${o.currency} ${item.planPrice}` : null,
    index === 0 && o.tax ? `order tax ${o.currency} ${o.tax}` : null,
  ].filter(Boolean);
  return {
    orderNumber: multi ? `${o.id}-${index + 1}` : o.id,
    customerId,
    productId,
    channel: "direct",
    marketplace: "infidec",
    transactionRef: o.id,
    licenseType: item.license,
    purchaseDate: o.createdAt ? Timestamp.fromDate(new Date(o.createdAt)) : Timestamp.now(),
    currency: o.currency,
    grossAmount: toMinor(item.total),
    authorEarnings: null,
    // Never trust the website's "paid" flag until a payment gateway confirms it.
    status: "pending",
    paymentStatus: "pending",
    refundStatus: "none",
    verificationStatus: "unverified",
    licenseId: null,
    source: "website",
    websiteOrderId: o.id,
    websiteStatus: o.status,
    websitePaymentMethod: o.paymentMethod,
    websitePlan: item.plan || null,
    notes: `Imported from website order ${o.id}${multi ? ` (item ${index + 1} of ${o.items.length})` : ""}. ${breakdown.join(", ")}. Website status "${o.status}" via ${o.paymentMethod || "unknown"} — confirm the payment before completing this order.`,
    createdBy: actorId,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    websiteSyncedAt: FieldValue.serverTimestamp(),
  };
}

// ----- sync history -----

const settingsRef = () => col("integrationSettings").doc("website");

export async function recordSync(stats: SyncStats, actor: { uid: string; email: string }) {
  await settingsRef().set({ lastSync: { ...stats, at: FieldValue.serverTimestamp(), by: actor.uid, byEmail: actor.email } }, { merge: true });
}

export interface LastSync extends SyncStats {
  at: string | null;
  byEmail: string | null;
}

export async function getLastSync(): Promise<LastSync | null> {
  const d = (await settingsRef().get()).get("lastSync");
  if (!d) return null;
  return { ...(d as SyncStats), at: d.at instanceof Timestamp ? d.at.toDate().toISOString() : null, byEmail: d.byEmail ?? null };
}

/** Counts of website-sourced records already in the admin. */
export async function websiteImportCounts() {
  const [customers, orders, pending] = await Promise.all([
    col("customers").where("source", "==", "website").count().get(),
    col("orders").where("source", "==", "website").count().get(),
    col("orders").where("source", "==", "website").where("status", "==", "pending").count().get(),
  ]);
  return { customers: customers.data().count, orders: orders.data().count, pending: pending.data().count };
}
