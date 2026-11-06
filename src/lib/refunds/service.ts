import "server-only";

import { FieldValue, Timestamp, type DocumentSnapshot } from "firebase-admin/firestore";
import type { z } from "zod";
import { DomainError } from "@/lib/actions";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { reserveNumber } from "@/lib/sales/service";
import { NEXT_STATUSES, REFUND_STATUS_LABELS, type RefundRecord, type RefundStatus, type refundRequestSchema } from "./schema";

export * from "./schema";

const refunds = () => adminDb.collection(COLLECTIONS.refunds);
const iso = (v: unknown) => (v instanceof Timestamp ? v.toDate().toISOString() : null);

function toRefund(snap: DocumentSnapshot): RefundRecord {
  const d = snap.data() ?? {};
  return {
    id: snap.id,
    number: String(d.number ?? snap.id),
    orderId: String(d.orderId ?? ""),
    orderNumber: String(d.orderNumber ?? ""),
    customerId: String(d.customerId ?? ""),
    productId: String(d.productId ?? ""),
    channel: d.channel === "direct" ? "direct" : "marketplace",
    marketplace: String(d.marketplace ?? ""),
    reason: String(d.reason ?? ""),
    amount: Number(d.amount ?? 0),
    currency: String(d.currency ?? "USD"),
    status: (d.status ?? "requested") as RefundStatus,
    adminNotes: String(d.adminNotes ?? ""),
    history: (Array.isArray(d.history) ? d.history : []).map((h: Record<string, unknown>) => ({
      status: h.status as RefundStatus,
      note: String(h.note ?? ""),
      byEmail: String(h.byEmail ?? ""),
      at: iso(h.at),
    })),
    createdAt: iso(d.createdAt),
  };
}

export async function listRefunds() {
  const snap = await refunds().limit(3000).get();
  return snap.docs.map(toRefund).sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

export async function createRefund(input: z.infer<typeof refundRequestSchema>, actor: { uid: string; email: string }) {
  const orderRef = adminDb.collection(COLLECTIONS.orders).doc(input.orderId);
  const ref = refunds().doc();
  await adminDb.runTransaction(async (tx) => {
    const order = await tx.get(orderRef);
    if (!order.exists) throw new DomainError("Order not found.");
    if (!["completed", "partially_refunded"].includes(order.get("status"))) throw new DomainError("Only completed orders can be refunded.");
    const open = await tx.get(refunds().where("orderId", "==", input.orderId));
    if (open.docs.some((r) => !["rejected", "completed"].includes(r.get("status")))) throw new DomainError("This order already has an open refund request.");
    const alreadyRefunded = open.docs.filter((r) => r.get("status") === "completed").reduce((s, r) => s + Number(r.get("amount") ?? 0), 0);
    const amount = Math.round(input.amount * 100);
    if (amount + alreadyRefunded > Number(order.get("grossAmount") ?? 0)) throw new DomainError("The refund would exceed the order amount.");
    const counter = await reserveNumber(tx, "refunds");
    counter.commit();
    tx.set(ref, {
      number: `RFD-${String(counter.value).padStart(6, "0")}`,
      orderId: input.orderId,
      orderNumber: order.get("orderNumber") ?? input.orderId,
      customerId: order.get("customerId"),
      productId: order.get("productId"),
      channel: order.get("channel"),
      marketplace: order.get("marketplace"),
      reason: input.reason,
      amount,
      currency: order.get("currency") ?? "USD",
      status: "requested",
      adminNotes: "",
      history: [{ status: "requested", note: input.reason, by: actor.uid, byEmail: actor.email, at: Timestamp.now() }],
      createdBy: actor.uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.update(orderRef, { refundStatus: "requested", updatedAt: FieldValue.serverTimestamp() });
  });
  return ref.id;
}

/** Moves a refund through its lifecycle; completing it updates the order and, for full refunds, the license. */
export async function transitionRefund(id: string, status: RefundStatus, note: string, actor: { uid: string; email: string }) {
  const ref = refunds().doc(id);
  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new DomainError("Refund not found.");
    const refund = toRefund(snap);
    if (!NEXT_STATUSES[refund.status].includes(status)) {
      throw new DomainError(`A ${REFUND_STATUS_LABELS[refund.status].toLowerCase()} refund can't become ${REFUND_STATUS_LABELS[status].toLowerCase()}.`);
    }
    const orderRef = adminDb.collection(COLLECTIONS.orders).doc(refund.orderId);
    const order = await tx.get(orderRef);
    const others = await tx.get(refunds().where("orderId", "==", refund.orderId).where("status", "==", "completed"));

    tx.update(ref, {
      status,
      ...(note ? { adminNotes: note } : {}),
      history: FieldValue.arrayUnion({ status, note, by: actor.uid, byEmail: actor.email, at: Timestamp.now() }),
      updatedAt: FieldValue.serverTimestamp(),
    });

    if (order.exists) {
      if (status === "completed") {
        const total = others.docs.reduce((s, r) => s + Number(r.get("amount") ?? 0), 0) + refund.amount;
        const full = total >= Number(order.get("grossAmount") ?? 0);
        tx.update(orderRef, {
          status: full ? "refunded" : "partially_refunded",
          refundStatus: full ? "full" : "partial",
          ...(full ? { paymentStatus: "refunded" } : {}),
          updatedAt: FieldValue.serverTimestamp(),
        });
        const licenseId = order.get("licenseId");
        if (full && licenseId) tx.update(adminDb.collection(COLLECTIONS.licenses).doc(licenseId), { status: "refunded", updatedAt: FieldValue.serverTimestamp() });
      } else if (status === "rejected") {
        tx.update(orderRef, { refundStatus: others.empty ? "none" : "partial", updatedAt: FieldValue.serverTimestamp() });
      }
    }
    return refund;
  });
}
