"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { AuthorizationError, assertPermission } from "@/lib/auth/session";
import { VERSION_STATUSES, VERSION_STATUS_LABELS, versionSchema, type VersionStatus } from "@/lib/packages/schema";
import { notifyVersion } from "@/lib/email/notify";
import { createVersion, deleteVersion, setVersionStatus, updateVersion } from "@/lib/packages/versions";
import { ProductError } from "@/lib/products/service";

type Result<T = object> = ({ ok: true; message: string } & T) | { ok: false; error: string };
const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/, "Invalid id.");

function failure(error: unknown): { ok: false; error: string } {
  if (error instanceof AuthorizationError || error instanceof ProductError) return { ok: false, error: error.message };
  if (error instanceof z.ZodError) return { ok: false, error: error.issues[0]?.message ?? "Please check the form." };
  console.error("[version action]", error);
  return { ok: false, error: "Something went wrong. Please try again." };
}

export async function createVersionAction(input: { productId: string; values: unknown }): Promise<Result<{ id: string }>> {
  try {
    const actor = await assertPermission("versions:create");
    const productId = id.parse(input.productId);
    const values = versionSchema.parse(input.values);
    const versionId = await createVersion(productId, values, actor.uid);
    await logActivity({
      action: "version.created",
      actorId: actor.uid,
      actorEmail: actor.email,
      targetType: "version",
      targetId: versionId,
      productId,
      summary: `Created version ${values.version}`,
    });
    refresh();
    return { ok: true, id: versionId, message: `Version ${values.version} created.` };
  } catch (error) {
    return failure(error);
  }
}

export async function updateVersionAction(input: { versionId: string; productId: string; values: unknown }): Promise<Result> {
  try {
    const actor = await assertPermission("versions:edit");
    const versionId = id.parse(input.versionId);
    const values = versionSchema.parse(input.values);
    await updateVersion(versionId, values, actor.uid);
    await logActivity({
      action: "version.updated",
      actorId: actor.uid,
      actorEmail: actor.email,
      targetType: "version",
      targetId: versionId,
      productId: id.parse(input.productId),
      summary: `Updated release notes for ${values.version}`,
    });
    refresh();
    return { ok: true, message: "Version saved." };
  } catch (error) {
    return failure(error);
  }
}

export async function setVersionStatusAction(input: { versionId: string; status: VersionStatus }): Promise<Result> {
  try {
    const { versionId, status } = z.object({ versionId: id, status: z.enum(VERSION_STATUSES) }).parse(input);
    const actor = await assertPermission(status === "published" || status === "deprecated" ? "versions:publish" : "versions:edit");
    const r = await setVersionStatus(versionId, status, actor.uid);
    await logActivity({
      action: "version.status_changed",
      actorId: actor.uid,
      actorEmail: actor.email,
      targetType: "version",
      targetId: versionId,
      productId: r.productId,
      summary: `Version ${r.version}: ${VERSION_STATUS_LABELS[r.previous]} → ${VERSION_STATUS_LABELS[status]}`,
      metadata: { productVersion: r.productVersion },
    });
    refresh();
    const tail = r.productVersion ? ` Current product version is now ${r.productVersion}.` : "";
    return { ok: true, message: `Version ${r.version} is ${VERSION_STATUS_LABELS[status].toLowerCase()}.${tail}` };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteVersionAction(versionId: string): Promise<Result> {
  try {
    const actor = await assertPermission("versions:delete");
    const r = await deleteVersion(id.parse(versionId));
    await logActivity({
      action: "version.deleted",
      actorId: actor.uid,
      actorEmail: actor.email,
      targetType: "version",
      targetId: versionId,
      productId: r.productId,
      summary: `Deleted draft version ${r.version}`,
    });
    refresh();
    return { ok: true, message: `Version ${r.version} deleted.` };
  } catch (error) {
    return failure(error);
  }
}

export async function notifyVersionAction(versionId: string): Promise<Result> {
  try {
    const actor = await assertPermission("versions:publish");
    const r = await notifyVersion(id.parse(versionId), actor.uid);
    await logActivity({
      action: "version.notified",
      actorId: actor.uid,
      actorEmail: actor.email,
      targetType: "version",
      targetId: versionId,
      summary: `Emailed ${r.sent} of ${r.recipients} license holder(s) (${r.template.replace("_", " ")})${r.failed ? `, ${r.failed} failed` : ""}`,
    });
    refresh();
    if (r.recipients === 0) return { ok: true, message: "No customers hold an active license for this product yet." };
    return { ok: true, message: `Emailed ${r.sent} of ${r.recipients} license holder(s).${r.failed ? ` ${r.failed} failed — see SMTP email logs.` : ""}` };
  } catch (error) {
    return failure(error);
  }
}
