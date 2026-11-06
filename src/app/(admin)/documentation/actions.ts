"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { docId, failure, type Result } from "@/lib/actions";
import { assertPermission } from "@/lib/auth/session";
import { docSchema } from "@/lib/docs/schema";
import { createDoc, createStandardOutline, deleteDoc, moveDoc, removeAttachment, restoreRevision, saveDoc, setDocStatus } from "@/lib/docs/service";

export async function createDocAction(input: { productId: string; kind: "section" | "page"; parentId: string | null; title: string }): Promise<Result<{ id: string }>> {
  try {
    const actor = await assertPermission("documentation:create");
    const v = z
      .object({ productId: docId, kind: z.enum(["section", "page"]), parentId: docId.nullable(), title: z.string().trim().min(2, "Enter a title.").max(140) })
      .parse(input);
    const id = await createDoc(v, actor);
    await logActivity({ action: "doc.created", actorId: actor.uid, actorEmail: actor.email, targetType: "doc", targetId: id, productId: v.productId, summary: `Created ${v.kind} "${v.title}"` });
    refresh();
    return { ok: true, id, message: `${v.kind === "section" ? "Section" : "Page"} created.` };
  } catch (error) {
    return failure(error, "doc create");
  }
}

export async function saveDocAction(input: { id: string; values: unknown }): Promise<Result> {
  try {
    const actor = await assertPermission("documentation:edit");
    const id = docId.parse(input.id);
    const values = docSchema.parse(input.values);
    await saveDoc(id, values, actor);
    await logActivity({ action: "doc.updated", actorId: actor.uid, actorEmail: actor.email, targetType: "doc", targetId: id, summary: `Saved "${values.title}"` });
    refresh();
    return { ok: true, message: "Saved." };
  } catch (error) {
    return failure(error, "doc save");
  }
}

export async function setDocStatusAction(input: { id: string; status: "draft" | "published" }): Promise<Result> {
  try {
    const { id, status } = z.object({ id: docId, status: z.enum(["draft", "published"]) }).parse(input);
    const actor = await assertPermission(status === "published" ? "documentation:publish" : "documentation:edit");
    const doc = await setDocStatus(id, status, actor.uid);
    await logActivity({
      action: "doc.status_changed",
      actorId: actor.uid,
      actorEmail: actor.email,
      targetType: "doc",
      targetId: id,
      productId: doc.productId,
      summary: `${status === "published" ? "Published" : "Unpublished"} "${doc.title}"`,
    });
    refresh();
    return { ok: true, message: status === "published" ? "Published." : "Moved back to draft." };
  } catch (error) {
    return failure(error, "doc status");
  }
}

export async function moveDocAction(input: { id: string; parentId: string | null; orderedSiblingIds: string[] }): Promise<Result> {
  try {
    await assertPermission("documentation:edit");
    const v = z.object({ id: docId, parentId: docId.nullable(), orderedSiblingIds: z.array(docId).max(500) }).parse(input);
    await moveDoc(v.id, v.parentId, v.orderedSiblingIds);
    refresh();
    return { ok: true, message: "Order saved." };
  } catch (error) {
    return failure(error, "doc move");
  }
}

export async function deleteDocAction(id: string): Promise<Result> {
  try {
    const actor = await assertPermission("documentation:delete");
    const doc = await deleteDoc(docId.parse(id));
    await logActivity({ action: "doc.deleted", actorId: actor.uid, actorEmail: actor.email, targetType: "doc", targetId: id, productId: doc.productId, summary: `Deleted "${doc.title}"` });
    refresh();
    return { ok: true, message: `"${doc.title}" deleted.` };
  } catch (error) {
    return failure(error, "doc delete");
  }
}

export async function restoreRevisionAction(input: { id: string; revisionId: string }): Promise<Result> {
  try {
    const actor = await assertPermission("documentation:edit");
    const v = z.object({ id: docId, revisionId: z.string().regex(/^\d{1,6}$/) }).parse(input);
    const revision = await restoreRevision(v.id, v.revisionId, actor);
    await logActivity({ action: "doc.restored", actorId: actor.uid, actorEmail: actor.email, targetType: "doc", targetId: v.id, summary: `Restored revision ${revision}` });
    refresh();
    return { ok: true, message: `Revision ${revision} restored. The previous content was kept as a revision.` };
  } catch (error) {
    return failure(error, "doc restore");
  }
}

export async function createOutlineAction(productId: string): Promise<Result> {
  try {
    const actor = await assertPermission("documentation:create");
    const created = await createStandardOutline(docId.parse(productId), actor);
    await logActivity({ action: "doc.outline_created", actorId: actor.uid, actorEmail: actor.email, targetType: "product", targetId: productId, productId, summary: `Created the standard documentation outline (${created} items)` });
    refresh();
    return { ok: true, message: created ? `Created ${created} sections and draft pages.` : "The standard outline already exists." };
  } catch (error) {
    return failure(error, "doc outline");
  }
}

export async function removeAttachmentAction(input: { id: string; attachmentId: string }): Promise<Result> {
  try {
    const actor = await assertPermission("documentation:edit");
    const v = z.object({ id: docId, attachmentId: z.string().uuid() }).parse(input);
    const att = await removeAttachment(v.id, v.attachmentId, actor.uid);
    await logActivity({ action: "doc.attachment_removed", actorId: actor.uid, actorEmail: actor.email, targetType: "doc", targetId: v.id, summary: `Removed attachment "${att.fileName}"` });
    refresh();
    return { ok: true, message: "Attachment removed." };
  } catch (error) {
    return failure(error, "doc attachment");
  }
}
