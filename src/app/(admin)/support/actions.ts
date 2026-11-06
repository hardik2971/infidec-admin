"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { docId, failure, type Result } from "@/lib/actions";
import { assertPermission } from "@/lib/auth/session";
import { PRIORITIES, TICKET_STATUSES, TICKET_STATUS_LABELS, ticketSchema } from "@/lib/support/schema";
import { createTicket, recheckEntitlement, saveCategories, updateTicket } from "@/lib/support/service";

export async function createTicketAction(values: unknown): Promise<Result<{ id: string }>> {
  try {
    const actor = await assertPermission("support:create");
    const v = ticketSchema.parse(values);
    const id = await createTicket(v, { uid: actor.uid, name: actor.displayName });
    await logActivity({ action: "ticket.created", actorId: actor.uid, actorEmail: actor.email, targetType: "ticket", targetId: id, productId: v.productId, summary: `Opened ticket "${v.subject}"` });
    refresh();
    return { ok: true, id, message: "Ticket created." };
  } catch (error) {
    return failure(error, "ticket create");
  }
}

const patchSchema = z.object({
  id: docId,
  status: z.enum(TICKET_STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  category: z.string().trim().min(1).max(60).optional(),
  assignedTo: docId.nullable().optional(),
});

export async function updateTicketAction(input: z.input<typeof patchSchema>): Promise<Result> {
  try {
    const actor = await assertPermission("support:edit");
    const { id, ...patch } = patchSchema.parse(input);
    const t = await updateTicket(id, patch, actor.uid);
    const what = patch.status
      ? `status → ${TICKET_STATUS_LABELS[patch.status]}`
      : patch.priority
        ? `priority → ${patch.priority}`
        : patch.category
          ? `category → ${patch.category}`
          : patch.assignedTo
            ? "assigned"
            : "unassigned";
    await logActivity({ action: "ticket.updated", actorId: actor.uid, actorEmail: actor.email, targetType: "ticket", targetId: id, productId: t.productId, summary: `${t.number}: ${what}` });
    refresh();
    return { ok: true, message: "Ticket updated." };
  } catch (error) {
    return failure(error, "ticket update");
  }
}

export async function recheckEntitlementAction(id: string): Promise<Result> {
  try {
    await assertPermission("support:view");
    const supported = await recheckEntitlement(docId.parse(id));
    refresh();
    return { ok: true, message: supported ? "Customer has active support." : "No active support entitlement for this product." };
  } catch (error) {
    return failure(error, "ticket entitlement");
  }
}

export async function saveCategoriesAction(categories: string[]): Promise<Result> {
  try {
    const actor = await assertPermission("support:edit");
    const list = z
      .array(z.string().trim().min(2).max(60))
      .min(1, "Keep at least one category.")
      .max(40)
      .parse(categories);
    const unique = [...new Map(list.map((c) => [c.toLowerCase(), c])).values()];
    await saveCategories(unique, actor.uid);
    await logActivity({ action: "ticket.categories_updated", actorId: actor.uid, actorEmail: actor.email, targetType: "systemSettings", targetId: "support", summary: `Support categories: ${unique.join(", ")}` });
    refresh();
    return { ok: true, message: "Categories saved." };
  } catch (error) {
    return failure(error, "ticket categories");
  }
}
