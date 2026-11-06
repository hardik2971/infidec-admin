"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { AuthorizationError, assertPermission } from "@/lib/auth/session";
import { formatBytes } from "@/lib/format";
import { cleanupStaleStaging, deletePackage, setUploadLimit, STORAGE_RULES_MAX_MB, updatePackageDetails } from "@/lib/packages/service";
import { ProductError } from "@/lib/products/service";

type Result = { ok: true; message: string } | { ok: false; error: string };
const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/, "Invalid id.");

function failure(error: unknown): Result {
  if (error instanceof AuthorizationError || error instanceof ProductError) return { ok: false, error: error.message };
  if (error instanceof z.ZodError) return { ok: false, error: error.issues[0]?.message ?? "Please check the form." };
  console.error("[package action]", error);
  return { ok: false, error: "Something went wrong. Please try again." };
}

export async function updatePackageAction(input: { packageId: string; name: string; releaseNotes: string }): Promise<Result> {
  try {
    const actor = await assertPermission("packages:edit");
    const v = z
      .object({ packageId: id, name: z.string().trim().min(1, "Enter a package name.").max(120), releaseNotes: z.string().trim().max(5000) })
      .parse(input);
    await updatePackageDetails(v.packageId, { name: v.name, releaseNotes: v.releaseNotes }, actor.uid);
    await logActivity({
      action: "package.updated",
      actorId: actor.uid,
      actorEmail: actor.email,
      targetType: "package",
      targetId: v.packageId,
      summary: `Updated package details for "${v.name}"`,
    });
    refresh();
    return { ok: true, message: "Package updated." };
  } catch (error) {
    return failure(error);
  }
}

export async function deletePackageAction(packageId: string): Promise<Result> {
  try {
    const actor = await assertPermission("packages:delete");
    const pkg = await deletePackage(id.parse(packageId), actor.uid);
    await logActivity({
      action: "package.deleted",
      actorId: actor.uid,
      actorEmail: actor.email,
      targetType: "package",
      targetId: pkg.id,
      productId: pkg.productId,
      summary: `Deleted "${pkg.fileName}" (v${pkg.version}, ${formatBytes(pkg.fileSize)})`,
      metadata: { sha256: pkg.sha256 },
    });
    refresh();
    return { ok: true, message: `"${pkg.fileName}" was deleted.` };
  } catch (error) {
    return failure(error);
  }
}

export async function cleanupStagingAction(): Promise<Result> {
  try {
    const actor = await assertPermission("storage:delete");
    const { deleted, bytes } = await cleanupStaleStaging();
    await logActivity({
      action: "storage.cleanup",
      actorId: actor.uid,
      actorEmail: actor.email,
      targetType: "storage",
      summary: `Removed ${deleted} abandoned upload(s) (${formatBytes(bytes)})`,
    });
    refresh();
    return { ok: true, message: deleted ? `Removed ${deleted} abandoned upload(s), freeing ${formatBytes(bytes)}.` : "Nothing to clean up." };
  } catch (error) {
    return failure(error);
  }
}

export async function setUploadLimitAction(maxUploadSizeMb: number): Promise<Result> {
  try {
    const actor = await assertPermission("storage:manage_settings");
    const mb = z.number().int().min(1).max(STORAGE_RULES_MAX_MB, `The Storage rules allow at most ${STORAGE_RULES_MAX_MB} MB.`).parse(maxUploadSizeMb);
    await setUploadLimit(mb, actor.uid);
    await logActivity({
      action: "settings.updated",
      actorId: actor.uid,
      actorEmail: actor.email,
      targetType: "systemSettings",
      targetId: "general",
      summary: `Set the maximum package upload size to ${mb} MB`,
    });
    refresh();
    return { ok: true, message: `Upload limit set to ${mb} MB.` };
  } catch (error) {
    return failure(error);
  }
}
