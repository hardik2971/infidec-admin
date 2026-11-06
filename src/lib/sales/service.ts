import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { FieldValue, Timestamp, type DocumentSnapshot, type Transaction } from "firebase-admin/firestore";
import { DomainError } from "@/lib/actions";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import type {
  CustomerRecord,
  CustomerStatus,
  CustomerValues,
  LicenseRecord,
  LicenseType,
  OrderRecord,
  OrderStatus,
  OrderValues,
} from "./schema";

const col = (name: keyof typeof COLLECTIONS) => adminDb.collection(COLLECTIONS[name]);
const iso = (v: unknown) => (v instanceof Timestamp ? v.toDate().toISOString() : null);
const toMinor = (n: number) => Math.round(n * 100);

/** Hashes a purchase code so it can be matched later without storing the code itself. */
export function hashPurchaseCode(code: string) {
  return createHash("sha256").update(code.trim().toLowerCase()).digest("hex");
}

/**
 * Sequential human-readable numbers (ORD-2026-000001, TKT-000001) via a transactional counter.
 * Reads now; call `commit()` together with the transaction's other writes (reads must precede writes).
 */
export async function reserveNumber(tx: Transaction, counter: "orders" | "tickets" | "refunds") {
  const ref = adminDb.collection(COLLECTIONS.systemSettings).doc("counters");
  const value = Number((await tx.get(ref)).get(counter) ?? 0) + 1;
  return { value, commit: () => void tx.set(ref, { [counter]: value }, { merge: true }) };
}

// ----- customers -----

function toCustomer(snap: DocumentSnapshot, orderCount = 0): CustomerRecord {
  const d = snap.data() ?? {};
  return {
    id: snap.id,
    name: String(d.name ?? ""),
    email: String(d.email ?? ""),
    phone: String(d.phone ?? ""),
    country: String(d.country ?? ""),
    company: String(d.company ?? ""),
    marketplaceUsername: String(d.marketplaceUsername ?? ""),
    status: (d.status ?? "active") as CustomerStatus,
    productIds: Array.isArray(d.productIds) ? d.productIds : [],
    uid: d.uid ?? null,
    orderCount,
    createdAt: iso(d.createdAt),
  };
}

export async function listCustomers(): Promise<CustomerRecord[]> {
  const [snap, orders] = await Promise.all([col("customers").limit(5000).get(), col("orders").select("customerId").get()]);
  const counts = new Map<string, number>();
  orders.docs.forEach((o) => counts.set(o.get("customerId"), (counts.get(o.get("customerId")) ?? 0) + 1));
  return snap.docs.map((d) => toCustomer(d, counts.get(d.id) ?? 0)).sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

export async function getCustomer(id: string) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return null;
  const snap = await col("customers").doc(id).get();
  return snap.exists ? toCustomer(snap) : null;
}

export async function saveCustomer(values: CustomerValues, actorId: string, id?: string) {
  const ref = id ? col("customers").doc(id) : col("customers").doc();
  await adminDb.runTransaction(async (tx) => {
    const clash = await tx.get(col("customers").where("email", "==", values.email).limit(2));
    if (clash.docs.some((d) => d.id !== ref.id)) throw new DomainError("Another customer already uses this email address.");
    if (id) {
      if (!(await tx.get(ref)).exists) throw new DomainError("Customer not found.");
      tx.update(ref, { ...values, updatedBy: actorId, updatedAt: FieldValue.serverTimestamp() });
    } else {
      tx.set(ref, { ...values, status: "active", productIds: [], uid: null, source: "manual", createdBy: actorId, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    }
  });
  return ref.id;
}

export async function setCustomerStatus(id: string, status: CustomerStatus, actorId: string) {
  const ref = col("customers").doc(id);
  if (!(await ref.get()).exists) throw new DomainError("Customer not found.");
  await ref.update({ status, updatedBy: actorId, updatedAt: FieldValue.serverTimestamp() });
}

export interface CustomerNote {
  id: string;
  body: string;
  authorEmail: string;
  createdAt: string | null;
}

export async function listCustomerNotes(id: string): Promise<CustomerNote[]> {
  const snap = await col("customers").doc(id).collection("notes").orderBy("createdAt", "desc").limit(200).get();
  return snap.docs.map((d) => ({ id: d.id, body: String(d.get("body")), authorEmail: String(d.get("authorEmail") ?? ""), createdAt: iso(d.get("createdAt")) }));
}

export async function addCustomerNote(id: string, body: string, actor: { uid: string; email: string }) {
  const ref = col("customers").doc(id);
  if (!(await ref.get()).exists) throw new DomainError("Customer not found.");
  await ref.collection("notes").add({ body, authorId: actor.uid, authorEmail: actor.email, createdAt: FieldValue.serverTimestamp() });
}

// ----- orders -----

function toOrder(snap: DocumentSnapshot): OrderRecord {
  const d = snap.data() ?? {};
  return {
    id: snap.id,
    orderNumber: String(d.orderNumber ?? snap.id),
    customerId: String(d.customerId ?? ""),
    productId: String(d.productId ?? ""),
    channel: d.channel === "direct" ? "direct" : "marketplace",
    marketplace: String(d.marketplace ?? ""),
    transactionRef: String(d.transactionRef ?? ""),
    licenseType: (d.licenseType ?? "regular") as LicenseType,
    purchaseDate: iso(d.purchaseDate),
    currency: String(d.currency ?? "USD"),
    grossAmount: Number(d.grossAmount ?? 0),
    authorEarnings: d.authorEarnings ?? null,
    status: (d.status ?? "pending") as OrderStatus,
    paymentStatus: d.paymentStatus ?? "pending",
    refundStatus: d.refundStatus ?? "none",
    verificationStatus: d.verificationStatus ?? "unverified",
    licenseId: d.licenseId ?? null,
    source: String(d.source ?? "manual"),
    notes: String(d.notes ?? ""),
    createdAt: iso(d.createdAt),
  };
}

export async function listOrders(filter: { customerId?: string; productId?: string; channel?: "marketplace" | "direct" } = {}) {
  let q: FirebaseFirestore.Query = col("orders");
  if (filter.customerId) q = q.where("customerId", "==", filter.customerId);
  if (filter.productId) q = q.where("productId", "==", filter.productId);
  if (filter.channel) q = q.where("channel", "==", filter.channel);
  const snap = await q.limit(5000).get();
  return snap.docs.map(toOrder).sort((a, b) => (b.purchaseDate ?? "").localeCompare(a.purchaseDate ?? ""));
}

export async function getOrder(id: string) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return null;
  const snap = await col("orders").doc(id).get();
  return snap.exists ? toOrder(snap) : null;
}

function licenseKey() {
  return `INF-${randomBytes(10).toString("hex").toUpperCase().match(/.{1,5}/g)!.join("-")}`;
}

function addMonths(date: Date, months: number) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

/**
 * Issues an INFIDEC license for a completed direct order (never for marketplace orders).
 * Write-only: callers read the product first (transactions need all reads before writes).
 */
function issueDirectLicense(tx: Transaction, orderRef: FirebaseFirestore.DocumentReference, order: Record<string, unknown>, supportMonths: number) {
  const months = supportMonths;
  const purchase = (order.purchaseDate as Timestamp).toDate();
  const ref = col("licenses").doc();
  tx.set(ref, {
    licenseKey: licenseKey(),
    productId: order.productId,
    customerId: order.customerId,
    orderId: orderRef.id,
    marketplace: "infidec",
    licenseType: order.licenseType,
    purchaseDate: order.purchaseDate,
    supportExpiry: Timestamp.fromDate(addMonths(purchase, months)),
    verificationStatus: "verified",
    status: "active",
    purchaseCodeHash: null,
    purchaseCodeLast4: null,
    marketplaceBuyer: null,
    entitlement: { versions: "all" },
    source: "direct",
    createdAt: FieldValue.serverTimestamp(),
  });
  tx.update(orderRef, { licenseId: ref.id });
  return ref.id;
}

export async function createOrder(values: OrderValues, actorId: string) {
  if (values.channel === "direct" && values.marketplace !== "infidec") throw new DomainError("Direct sales are recorded against the INFIDEC website.");
  const ref = col("orders").doc();
  let licenseId: string | null = null;
  await adminDb.runTransaction(async (tx) => {
    const [customer, product] = await Promise.all([tx.get(col("customers").doc(values.customerId)), tx.get(col("products").doc(values.productId))]);
    if (!customer.exists) throw new DomainError("Customer not found.");
    if (!product.exists) throw new DomainError("Product not found.");
    const counter = await reserveNumber(tx, "orders");
    const n = counter.value;
    counter.commit();
    const supportMonths = Number(product.get("supportDurationMonths") ?? 6);
    const data = {
      ...values,
      orderNumber: `ORD-${values.purchaseDate.slice(0, 4)}-${String(n).padStart(6, "0")}`,
      purchaseDate: Timestamp.fromDate(new Date(`${values.purchaseDate}T12:00:00Z`)),
      grossAmount: toMinor(values.grossAmount),
      authorEarnings: values.authorEarnings === null ? null : toMinor(values.authorEarnings),
      refundStatus: "none",
      // Manual marketplace entries are never "verified" — only the Envato API can verify a sale.
      verificationStatus: values.channel === "direct" ? "verified" : "unverified",
      licenseId: null,
      source: "manual",
      createdBy: actorId,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    tx.set(ref, data);
    tx.update(customer.ref, { productIds: FieldValue.arrayUnion(values.productId), updatedAt: FieldValue.serverTimestamp() });
    if (values.channel === "direct" && values.status === "completed") licenseId = issueDirectLicense(tx, ref, data, supportMonths);
  });
  return { id: ref.id, licenseId };
}

export async function setOrderStatus(id: string, status: OrderStatus, actorId: string) {
  const ref = col("orders").doc(id);
  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new DomainError("Order not found.");
    const order = snap.data()!;
    const previous = order.status as OrderStatus;
    const product = await tx.get(col("products").doc(String(order.productId)));
    tx.update(ref, {
      status,
      ...(status === "refunded" ? { refundStatus: "full", paymentStatus: "refunded" } : {}),
      ...(status === "partially_refunded" ? { refundStatus: "partial" } : {}),
      ...(status === "completed" && order.channel === "direct" ? { paymentStatus: "paid" } : {}),
      updatedBy: actorId,
      updatedAt: FieldValue.serverTimestamp(),
    });
    let licenseId: string | null = order.licenseId ?? null;
    if (status === "completed" && order.channel === "direct" && !licenseId) licenseId = issueDirectLicense(tx, ref, order, Number(product.get("supportDurationMonths") ?? 6));
    if (licenseId && (status === "refunded" || status === "cancelled")) {
      tx.update(col("licenses").doc(licenseId), { status: status === "refunded" ? "refunded" : "revoked", updatedAt: FieldValue.serverTimestamp() });
    }
    return { previous, orderNumber: String(order.orderNumber ?? id), productId: String(order.productId) };
  });
}

// ----- licenses -----

function toLicense(snap: DocumentSnapshot): LicenseRecord {
  const d = snap.data() ?? {};
  return {
    id: snap.id,
    licenseKey: String(d.licenseKey ?? ""),
    productId: String(d.productId ?? ""),
    customerId: String(d.customerId ?? ""),
    orderId: d.orderId ?? null,
    marketplace: String(d.marketplace ?? ""),
    licenseType: (d.licenseType ?? "regular") as LicenseType,
    purchaseDate: iso(d.purchaseDate),
    supportExpiry: iso(d.supportExpiry),
    verificationStatus: d.verificationStatus ?? "unverified",
    status: d.status ?? "active",
    purchaseCodeLast4: d.purchaseCodeLast4 ?? null,
    marketplaceBuyer: d.marketplaceBuyer ?? null,
    source: d.source ?? "manual",
    createdAt: iso(d.createdAt),
  };
}

export async function listLicenses(filter: { customerId?: string; productId?: string } = {}) {
  let q: FirebaseFirestore.Query = col("licenses");
  if (filter.customerId) q = q.where("customerId", "==", filter.customerId);
  if (filter.productId) q = q.where("productId", "==", filter.productId);
  const snap = await q.limit(5000).get();
  return snap.docs.map(toLicense).sort((a, b) => (b.purchaseDate ?? "").localeCompare(a.purchaseDate ?? ""));
}

export async function getLicense(id: string) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return null;
  const snap = await col("licenses").doc(id).get();
  return snap.exists ? toLicense(snap) : null;
}

export async function setLicenseStatus(id: string, status: "active" | "revoked", actorId: string) {
  const ref = col("licenses").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new DomainError("License not found.");
  if (snap.get("status") === "refunded") throw new DomainError("Refunded licenses can't be reactivated.");
  await ref.update({ status, updatedBy: actorId, updatedAt: FieldValue.serverTimestamp() });
  return toLicense(snap);
}

/** Finds the license recorded for a purchase code (codes are stored only as hashes). */
export async function findLicenseByPurchaseCode(code: string) {
  const snap = await col("licenses").where("purchaseCodeHash", "==", hashPurchaseCode(code)).limit(1).get();
  return snap.empty ? null : toLicense(snap.docs[0]);
}

export interface VerifiedSaleInput {
  code: string;
  productId: string;
  buyer: string;
  licenseType: LicenseType;
  soldAt: string;
  supportedUntil: string | null;
  /** Amount exactly as reported by Envato (major units, USD). */
  reportedAmount: number;
  /** Staff-confirmed author earnings for revenue reporting. */
  authorEarnings: number | null;
  customer: { id?: string; name: string; email: string };
}

/** Records a sale verified via the Envato API: customer (found or created), order and license, atomically. */
export async function recordVerifiedSale(input: VerifiedSaleInput, actorId: string) {
  const codeHash = hashPurchaseCode(input.code);
  const orderRef = col("orders").doc();
  const licenseRef = col("licenses").doc();
  let customerId = input.customer.id ?? "";
  await adminDb.runTransaction(async (tx) => {
    const existing = await tx.get(col("licenses").where("purchaseCodeHash", "==", codeHash).limit(1));
    if (!existing.empty) throw new DomainError("This purchase code is already recorded.");
    const product = await tx.get(col("products").doc(input.productId));
    if (!product.exists) throw new DomainError("Product not found.");
    // Reserve the order number before any write in this transaction.
    const counter = await reserveNumber(tx, "orders");
    const n = counter.value;

    let customerRef: FirebaseFirestore.DocumentReference;
    if (customerId) {
      customerRef = col("customers").doc(customerId);
      if (!(await tx.get(customerRef)).exists) throw new DomainError("Customer not found.");
    } else {
      const byUser = await tx.get(col("customers").where("marketplaceUsername", "==", input.buyer).limit(1));
      const byEmail = input.customer.email ? await tx.get(col("customers").where("email", "==", input.customer.email.toLowerCase()).limit(1)) : null;
      const found = byUser.docs[0] ?? byEmail?.docs[0];
      customerRef = found?.ref ?? col("customers").doc();
      if (!found) {
        if (!input.customer.email) throw new DomainError("Enter the buyer's email to create their customer record.");
        tx.set(customerRef, {
          name: input.customer.name || input.buyer,
          email: input.customer.email.toLowerCase(),
          phone: "",
          country: "",
          company: "",
          marketplaceUsername: input.buyer,
          status: "active",
          productIds: [],
          uid: null,
          source: "envato-verification",
          createdBy: actorId,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      customerId = customerRef.id;
    }

    const soldAt = Timestamp.fromDate(new Date(input.soldAt));
    counter.commit();
    tx.set(orderRef, {
      orderNumber: `ORD-${input.soldAt.slice(0, 4)}-${String(n).padStart(6, "0")}`,
      customerId,
      productId: input.productId,
      channel: "marketplace",
      marketplace: "envato",
      transactionRef: `Envato purchase code …${input.code.slice(-4)}`,
      licenseType: input.licenseType,
      purchaseDate: soldAt,
      currency: "USD",
      // Envato does not expose the buyer's gross price here; only the reported amount is stored.
      grossAmount: toMinor(input.reportedAmount),
      envatoReportedAmount: toMinor(input.reportedAmount),
      authorEarnings: input.authorEarnings === null ? null : toMinor(input.authorEarnings),
      status: "completed",
      paymentStatus: "paid",
      refundStatus: "none",
      verificationStatus: "verified",
      licenseId: licenseRef.id,
      source: "envato-verification",
      notes: "",
      createdBy: actorId,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(licenseRef, {
      licenseKey: licenseKey(),
      productId: input.productId,
      customerId,
      orderId: orderRef.id,
      marketplace: "envato",
      licenseType: input.licenseType,
      purchaseDate: soldAt,
      supportExpiry: input.supportedUntil ? Timestamp.fromDate(new Date(input.supportedUntil)) : null,
      verificationStatus: "verified",
      status: "active",
      purchaseCodeHash: codeHash,
      purchaseCodeLast4: input.code.slice(-4),
      marketplaceBuyer: input.buyer,
      entitlement: { versions: "all" },
      source: "envato",
      verifiedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.update(customerRef, { productIds: FieldValue.arrayUnion(input.productId), updatedAt: FieldValue.serverTimestamp() });
  });
  return { orderId: orderRef.id, licenseId: licenseRef.id, customerId };
}
