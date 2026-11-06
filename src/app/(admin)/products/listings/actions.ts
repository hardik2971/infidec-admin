"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { docId, failure, type Result } from "@/lib/actions";
import { assertPermission } from "@/lib/auth/session";
import { LISTING_STATUSES, LISTING_STATUS_LABELS, listingSchema, type ListingStatus } from "@/lib/listings/schema";
import { createListing, deleteListing, saveListing, transitionListing } from "@/lib/listings/service";

export async function createListingAction(input: { productId: string; marketplaceId: string }): Promise<Result<{ id: string }>> {
  try {
    const actor = await assertPermission("listings:create");
    const v = z.object({ productId: docId, marketplaceId: z.string().regex(/^[a-z0-9_-]{1,40}$/) }).parse(input);
    const id = await createListing(v.productId, v.marketplaceId, actor);
    await logActivity({ action: "listing.created", actorId: actor.uid, actorEmail: actor.email, targetType: "listing", targetId: id, productId: v.productId, summary: `Started a ${v.marketplaceId} submission` });
    refresh();
    return { ok: true, id, message: "Submission created from the product's data." };
  } catch (error) {
    return failure(error, "listing create");
  }
}

export async function saveListingAction(input: { id: string; values: unknown }): Promise<Result> {
  try {
    const actor = await assertPermission("listings:edit");
    const id = docId.parse(input.id);
    await saveListing(id, listingSchema.parse(input.values), actor.uid);
    refresh();
    return { ok: true, message: "Submission saved." };
  } catch (error) {
    return failure(error, "listing save");
  }
}

export async function transitionListingAction(input: { id: string; status: ListingStatus; note: string; itemId?: string; itemUrl?: string }): Promise<Result> {
  try {
    const v = z
      .object({
        id: docId,
        status: z.enum(LISTING_STATUSES),
        note: z.string().trim().max(5000),
        itemId: z.string().trim().max(20).optional(),
        itemUrl: z.string().trim().max(500).refine((u) => !u || /^https:\/\/\S+$/.test(u), "Use an https:// URL.").optional(),
      })
      .parse(input);
    const actor = await assertPermission(v.status === "approved" || v.status === "published" ? "listings:approve" : v.status === "submitted" ? "listings:publish" : "listings:edit");
    const l = await transitionListing(v.id, v.status, v, actor);
    await logActivity({
      action: "listing.status_changed",
      actorId: actor.uid,
      actorEmail: actor.email,
      targetType: "listing",
      targetId: v.id,
      productId: l.productId,
      summary: `Submission "${l.itemTitle}": ${LISTING_STATUS_LABELS[l.status]} → ${LISTING_STATUS_LABELS[v.status]}`,
    });
    refresh();
    return { ok: true, message: `Marked ${LISTING_STATUS_LABELS[v.status].toLowerCase()}.` };
  } catch (error) {
    return failure(error, "listing transition");
  }
}

export async function deleteListingAction(id: string): Promise<Result> {
  try {
    const actor = await assertPermission("listings:delete");
    const l = await deleteListing(docId.parse(id));
    await logActivity({ action: "listing.deleted", actorId: actor.uid, actorEmail: actor.email, targetType: "listing", targetId: id, productId: l.productId, summary: `Deleted draft submission "${l.itemTitle}"` });
    refresh();
    return { ok: true, message: "Draft submission deleted." };
  } catch (error) {
    return failure(error, "listing delete");
  }
}
