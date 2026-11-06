"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { docId, failure, type Result } from "@/lib/actions";
import { assertPermission } from "@/lib/auth/session";
import { REFUND_STATUSES, REFUND_STATUS_LABELS, createRefund, refundRequestSchema, transitionRefund, type RefundStatus } from "@/lib/refunds/service";

export async function createRefundAction(values: unknown): Promise<Result<{ id: string }>> {
  try {
    const actor = await assertPermission("refunds:create");
    const v = refundRequestSchema.parse(values);
    const id = await createRefund(v, actor);
    await logActivity({ action: "refund.requested", actorId: actor.uid, actorEmail: actor.email, targetType: "refund", targetId: id, summary: `Refund requested for order ${v.orderId}` });
    refresh();
    return { ok: true, id, message: "Refund request recorded." };
  } catch (error) {
    return failure(error, "refund create");
  }
}

export async function transitionRefundAction(input: { id: string; status: RefundStatus; note: string }): Promise<Result> {
  try {
    const v = z.object({ id: docId, status: z.enum(REFUND_STATUSES), note: z.string().trim().max(2000) }).parse(input);
    const actor = await assertPermission(v.status === "approved" || v.status === "rejected" ? "refunds:approve" : "refunds:edit");
    const r = await transitionRefund(v.id, v.status, v.note, actor);
    await logActivity({
      action: "refund.status_changed",
      actorId: actor.uid,
      actorEmail: actor.email,
      targetType: "refund",
      targetId: v.id,
      productId: r.productId,
      summary: `${r.number}: ${REFUND_STATUS_LABELS[r.status]} → ${REFUND_STATUS_LABELS[v.status]}`,
    });
    refresh();
    return { ok: true, message: `Refund ${REFUND_STATUS_LABELS[v.status].toLowerCase()}.` };
  } catch (error) {
    return failure(error, "refund transition");
  }
}
