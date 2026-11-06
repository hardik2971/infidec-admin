"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { AuthorizationError, assertPermission } from "@/lib/auth/session";
import { deleteProductMedia, reorderScreenshots, updateMediaAlt } from "@/lib/products/media";
import { PRODUCT_STATUSES, SECTION_SCHEMAS, STATUS_LABELS, basicSchema, type ProductStatus, type SectionKey } from "@/lib/products/schema";
import {
  ProductError,
  createDraft,
  deleteProduct,
  duplicateProduct,
  markWizardStep,
  setStatus,
  updateSection,
} from "@/lib/products/service";
import type { Permission } from "@/lib/rbac/permissions";

export type ActionResult<T = object> = ({ ok: true; message?: string } & T) | { ok: false; error: string; fieldErrors?: Record<string, string> };

const productId = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/, "Invalid product.");

function failure(error: unknown): { ok: false; error: string; fieldErrors?: Record<string, string> } {
  if (error instanceof AuthorizationError || error instanceof ProductError) return { ok: false, error: error.message };
  if (error instanceof z.ZodError) {
    const fieldErrors = Object.fromEntries(error.issues.map((i) => [i.path.join("."), i.message]));
    return { ok: false, error: error.issues[0]?.message ?? "Please check the form.", fieldErrors };
  }
  console.error("[product action]", error);
  return { ok: false, error: "Something went wrong. Please try again." };
}

export async function createProductDraftAction(values: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await assertPermission("products:create");
    const data = basicSchema.parse(values);
    const id = await createDraft(data, actor.uid);
    await logActivity({
      action: "product.created",
      actorId: actor.uid,
      actorEmail: actor.email,
      targetType: "product",
      targetId: id,
      productId: id,
      summary: `Created draft "${data.name}"`,
    });
    refresh();
    return { ok: true, id, message: "Draft saved." };
  } catch (error) {
    return failure(error);
  }
}

const sectionInput = z.object({
  productId,
  section: z.enum(Object.keys(SECTION_SCHEMAS) as [SectionKey, ...SectionKey[]]),
  values: z.unknown(),
  wizardStep: z.number().int().min(1).max(8).optional(),
});

export async function saveProductSectionAction(input: z.input<typeof sectionInput>): Promise<ActionResult> {
  try {
    const actor = await assertPermission("products:edit");
    const { productId: id, section, values, wizardStep } = sectionInput.parse(input);
    const parsed = SECTION_SCHEMAS[section].parse(values);
    await updateSection(id, section, parsed as never, actor.uid, wizardStep);
    await logActivity({
      action: "product.updated",
      actorId: actor.uid,
      actorEmail: actor.email,
      targetType: "product",
      targetId: id,
      productId: id,
      summary: `Updated ${section} details`,
      metadata: { section },
    });
    refresh();
    return { ok: true, message: "Changes saved." };
  } catch (error) {
    return failure(error);
  }
}

export async function completeWizardStepAction(input: { productId: string; step: number }): Promise<ActionResult> {
  try {
    const actor = await assertPermission("products:edit");
    const { productId: id, step } = z.object({ productId, step: z.number().int().min(1).max(8) }).parse(input);
    await markWizardStep(id, step, actor.uid);
    refresh();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

/** Publishing and suspending are publish-level decisions; the rest are edits. */
const STATUS_PERMISSION: Record<ProductStatus, Permission> = {
  published: "products:publish",
  suspended: "products:publish",
  draft: "products:edit",
  in_review: "products:edit",
  archived: "products:edit",
};

export async function setProductStatusAction(input: { productId: string; status: ProductStatus }): Promise<ActionResult> {
  try {
    const { productId: id, status } = z.object({ productId, status: z.enum(PRODUCT_STATUSES) }).parse(input);
    const actor = await assertPermission(STATUS_PERMISSION[status]);
    const previous = await setStatus(id, status, actor.uid);
    await logActivity({
      action: "product.status_changed",
      actorId: actor.uid,
      actorEmail: actor.email,
      targetType: "product",
      targetId: id,
      productId: id,
      summary: `Status changed from ${STATUS_LABELS[previous]} to ${STATUS_LABELS[status]}`,
      metadata: { from: previous, to: status },
    });
    refresh();
    return { ok: true, message: `Product is now ${STATUS_LABELS[status].toLowerCase()}.` };
  } catch (error) {
    return failure(error);
  }
}

export async function duplicateProductAction(id: string): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await assertPermission("products:create");
    const sourceId = productId.parse(id);
    const newId = await duplicateProduct(sourceId, actor.uid);
    await logActivity({
      action: "product.duplicated",
      actorId: actor.uid,
      actorEmail: actor.email,
      targetType: "product",
      targetId: newId,
      productId: newId,
      summary: "Duplicated product as a new draft",
      metadata: { sourceId },
    });
    refresh();
    return { ok: true, id: newId, message: "Copy created as a draft." };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteProductAction(id: string): Promise<ActionResult> {
  try {
    const actor = await assertPermission("products:delete");
    const target = productId.parse(id);
    const { name, files } = await deleteProduct(target);
    await logActivity({
      action: "product.deleted",
      actorId: actor.uid,
      actorEmail: actor.email,
      targetType: "product",
      targetId: target,
      productId: target,
      summary: `Deleted "${name}" and ${files} image(s)`,
    });
    refresh();
    return { ok: true, message: `"${name}" was deleted.` };
  } catch (error) {
    return failure(error);
  }
}

// ----- media -----

export async function deleteMediaAction(input: { productId: string; mediaId: string }): Promise<ActionResult> {
  try {
    const actor = await assertPermission("products:edit");
    const { productId: pid, mediaId } = z.object({ productId, mediaId: productId }).parse(input);
    const { kind } = await deleteProductMedia(pid, mediaId, actor.uid);
    await logActivity({
      action: "product.media_removed",
      actorId: actor.uid,
      actorEmail: actor.email,
      targetType: "product",
      targetId: pid,
      productId: pid,
      summary: `Removed a ${kind} image`,
      metadata: { mediaId },
    });
    refresh();
    return { ok: true, message: "Image removed." };
  } catch (error) {
    return failure(error);
  }
}

export async function updateMediaAltAction(input: { productId: string; mediaId: string; alt: string }): Promise<ActionResult> {
  try {
    await assertPermission("products:edit");
    const v = z.object({ productId, mediaId: productId, alt: z.string().trim().max(300) }).parse(input);
    await updateMediaAlt(v.productId, v.mediaId, v.alt);
    refresh();
    return { ok: true, message: "Alt text saved." };
  } catch (error) {
    return failure(error);
  }
}

export async function reorderScreenshotsAction(input: { productId: string; orderedIds: string[] }): Promise<ActionResult> {
  try {
    const actor = await assertPermission("products:edit");
    const v = z.object({ productId, orderedIds: z.array(productId).max(200) }).parse(input);
    await reorderScreenshots(v.productId, v.orderedIds);
    await logActivity({
      action: "product.media_updated",
      actorId: actor.uid,
      actorEmail: actor.email,
      targetType: "product",
      targetId: v.productId,
      productId: v.productId,
      summary: "Reordered screenshots",
    });
    refresh();
    return { ok: true, message: "Order saved." };
  } catch (error) {
    return failure(error);
  }
}
