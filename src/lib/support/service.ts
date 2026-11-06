import "server-only";

import { randomUUID } from "node:crypto";
import { FieldValue, Timestamp, type DocumentSnapshot } from "firebase-admin/firestore";
import { DomainError } from "@/lib/actions";
import { adminDb, adminStorage } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { slugify } from "@/lib/products/schema";
import { supportActive } from "@/lib/sales/schema";
import { listLicenses, reserveNumber } from "@/lib/sales/service";
import { DEFAULT_CATEGORIES, type Priority, type TicketAttachment, type TicketMessage, type TicketRecord, type TicketStatus, type TicketValues } from "./schema";

const tickets = () => adminDb.collection(COLLECTIONS.supportTickets);
const settings = () => adminDb.collection(COLLECTIONS.systemSettings).doc("support");
const iso = (v: unknown) => (v instanceof Timestamp ? v.toDate().toISOString() : null);
export const MAX_TICKET_FILE = 10 * 1024 * 1024;

function toTicket(snap: DocumentSnapshot): TicketRecord {
  const d = snap.data() ?? {};
  return {
    id: snap.id,
    number: String(d.number ?? snap.id),
    subject: String(d.subject ?? ""),
    category: String(d.category ?? ""),
    status: (d.status ?? "open") as TicketStatus,
    priority: (d.priority ?? "normal") as Priority,
    productId: String(d.productId ?? ""),
    customerId: String(d.customerId ?? ""),
    assignedTo: d.assignedTo ?? null,
    assignedToName: d.assignedToName ?? null,
    entitlement: d.entitlement
      ? { supported: !!d.entitlement.supported, supportExpiry: iso(d.entitlement.supportExpiry), licenseId: d.entitlement.licenseId ?? null, checkedAt: iso(d.entitlement.checkedAt) }
      : null,
    messageCount: Number(d.messageCount ?? 0),
    lastMessageBy: d.lastMessageBy ?? null,
    lastMessageAt: iso(d.lastMessageAt),
    createdAt: iso(d.createdAt),
  };
}

export async function getCategories(): Promise<string[]> {
  const list = (await settings().get()).get("categories");
  return Array.isArray(list) && list.length ? list : DEFAULT_CATEGORIES;
}

export async function saveCategories(categories: string[], actorId: string) {
  await settings().set({ categories, updatedBy: actorId, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

/** Support entitlement: an active license for the product with support not yet expired. */
export async function checkSupportEntitlement(customerId: string, productId: string) {
  const licenses = (await listLicenses({ customerId, productId })).filter((l) => l.status === "active");
  const best = licenses.sort((a, b) => (b.supportExpiry ?? "").localeCompare(a.supportExpiry ?? ""))[0];
  return {
    supported: best ? supportActive(best) : false,
    supportExpiry: best?.supportExpiry ? Timestamp.fromDate(new Date(best.supportExpiry)) : null,
    licenseId: best?.id ?? null,
    checkedAt: Timestamp.now(),
  };
}

export async function listTickets(filter: { customerId?: string } = {}) {
  const q = filter.customerId ? tickets().where("customerId", "==", filter.customerId) : tickets();
  const snap = await q.limit(3000).get();
  return snap.docs.map(toTicket).sort((a, b) => (b.lastMessageAt ?? b.createdAt ?? "").localeCompare(a.lastMessageAt ?? a.createdAt ?? ""));
}

export async function getTicket(id: string) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return null;
  const snap = await tickets().doc(id).get();
  return snap.exists ? toTicket(snap) : null;
}

export async function listMessages(id: string): Promise<TicketMessage[]> {
  const snap = await tickets().doc(id).collection("messages").orderBy("createdAt", "asc").get();
  return snap.docs.map((d) => ({
    id: d.id,
    authorType: d.get("authorType"),
    authorName: String(d.get("authorName") ?? ""),
    body: String(d.get("body") ?? ""),
    internal: !!d.get("internal"),
    attachments: d.get("attachments") ?? [],
    createdAt: iso(d.get("createdAt")),
  }));
}

/** Staff open a ticket on a customer's behalf (e.g. from an email). */
export async function createTicket(values: TicketValues, actor: { uid: string; name: string }) {
  const [customer, product] = await Promise.all([
    adminDb.collection(COLLECTIONS.customers).doc(values.customerId).get(),
    adminDb.collection(COLLECTIONS.products).doc(values.productId).get(),
  ]);
  if (!customer.exists) throw new DomainError("Customer not found.");
  if (!product.exists) throw new DomainError("Product not found.");
  const entitlement = await checkSupportEntitlement(values.customerId, values.productId);
  const ref = tickets().doc();
  await adminDb.runTransaction(async (tx) => {
    const counter = await reserveNumber(tx, "tickets");
    counter.commit();
    tx.set(ref, {
      number: `TKT-${String(counter.value).padStart(6, "0")}`,
      subject: values.subject,
      category: values.category,
      priority: values.priority,
      status: "open",
      productId: values.productId,
      customerId: values.customerId,
      assignedTo: null,
      assignedToName: null,
      entitlement,
      messageCount: 1,
      lastMessageBy: "customer",
      lastMessageAt: FieldValue.serverTimestamp(),
      createdBy: actor.uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(ref.collection("messages").doc(), {
      authorType: "customer",
      authorId: values.customerId,
      authorName: String(customer.get("name")),
      body: values.body,
      internal: false,
      attachments: [],
      enteredBy: actor.uid,
      createdAt: FieldValue.serverTimestamp(),
    });
  });
  return ref.id;
}

const ALLOWED_FILES: [RegExp, (b: Buffer) => boolean][] = [
  [/^image\/(png|jpeg|webp)$/, (b) => b[0] === 0x89 || (b[0] === 0xff && b[1] === 0xd8) || b.toString("ascii", 8, 12) === "WEBP"],
  [/^application\/pdf$/, (b) => b.subarray(0, 5).toString("latin1") === "%PDF-"],
  [/^application\/(zip|x-zip-compressed)$/, (b) => b[0] === 0x50 && b[1] === 0x4b],
  [/^text\/plain$/, () => true],
];

/** Adds a staff reply or internal note, with optional attachments (≤ 10 MB each). */
export async function addMessage(
  id: string,
  input: { body: string; internal: boolean; files: { name: string; type: string; buffer: Buffer }[] },
  actor: { uid: string; name: string },
) {
  const ref = tickets().doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new DomainError("Ticket not found.");
  if (snap.get("status") === "closed") throw new DomainError("This ticket is closed. Reopen it to reply.");

  const attachments: TicketAttachment[] = [];
  for (const f of input.files) {
    if (f.buffer.length > MAX_TICKET_FILE) throw new DomainError(`${f.name} is larger than 10 MB.`);
    const rule = ALLOWED_FILES.find(([re]) => re.test(f.type));
    if (!rule || !rule[1](f.buffer)) throw new DomainError(`${f.name}: only images, PDF, ZIP and text files can be attached.`);
    const ext = (f.name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5);
    const storagePath = `tickets/${id}/${randomUUID()}-${slugify(f.name.replace(/\.[^.]+$/, "")) || "file"}.${ext}`;
    await adminStorage.bucket().file(storagePath).save(f.buffer, { resumable: false, contentType: f.type, metadata: { cacheControl: "private, no-store" } });
    attachments.push({ name: f.name, size: f.buffer.length, contentType: f.type, storagePath });
  }

  const batch = adminDb.batch();
  batch.set(ref.collection("messages").doc(), {
    authorType: "staff",
    authorId: actor.uid,
    authorName: actor.name,
    body: input.body,
    internal: input.internal,
    attachments,
    // Email delivery arrives with SMTP in Phase 6; replies are recorded now.
    emailStatus: input.internal ? "not_applicable" : "pending_smtp",
    createdAt: FieldValue.serverTimestamp(),
  });
  const status = snap.get("status") as TicketStatus;
  batch.update(ref, {
    messageCount: FieldValue.increment(1),
    updatedAt: FieldValue.serverTimestamp(),
    ...(input.internal
      ? {}
      : {
          lastMessageBy: "staff",
          lastMessageAt: FieldValue.serverTimestamp(),
          ...(status === "open" || status === "in_progress" ? { status: "waiting_customer" } : {}),
        }),
  });
  await batch.commit();
  return { attachments: attachments.length, subject: String(snap.get("subject")) };
}

export async function updateTicket(
  id: string,
  patch: { status?: TicketStatus; priority?: Priority; category?: string; assignedTo?: string | null },
  actorId: string,
) {
  const ref = tickets().doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new DomainError("Ticket not found.");
  const update: Record<string, unknown> = { updatedBy: actorId, updatedAt: FieldValue.serverTimestamp() };
  if (patch.status) update.status = patch.status;
  if (patch.priority) update.priority = patch.priority;
  if (patch.category) update.category = patch.category;
  if (patch.assignedTo !== undefined) {
    if (patch.assignedTo) {
      const staff = await adminDb.collection(COLLECTIONS.staff).doc(patch.assignedTo).get();
      if (!staff.exists || staff.get("status") !== "active") throw new DomainError("Choose an active staff member.");
      update.assignedTo = patch.assignedTo;
      update.assignedToName = staff.get("displayName") ?? staff.get("email");
    } else {
      update.assignedTo = null;
      update.assignedToName = null;
    }
  }
  await ref.update(update);
  return toTicket(snap);
}

export async function recheckEntitlement(id: string) {
  const ticket = await getTicket(id);
  if (!ticket) throw new DomainError("Ticket not found.");
  const entitlement = await checkSupportEntitlement(ticket.customerId, ticket.productId);
  await tickets().doc(id).update({ entitlement });
  return entitlement.supported;
}

export async function ticketAttachmentUrl(id: string, storagePath: string) {
  if (!storagePath.startsWith(`tickets/${id}/`)) throw new DomainError("Attachment not found.");
  const [url] = await adminStorage.bucket().file(storagePath).getSignedUrl({ version: "v4", action: "read", expires: Date.now() + 10 * 60 * 1000 });
  return url;
}
