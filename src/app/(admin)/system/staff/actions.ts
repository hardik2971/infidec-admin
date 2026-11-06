"use server";

import { FieldValue } from "firebase-admin/firestore";
import { refresh } from "next/cache";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { AuthorizationError, assertPermission } from "@/lib/auth/session";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { ROLE_IDS } from "@/lib/rbac/roles";
import { countActiveSuperAdmins, createStaffMember, syncClaims } from "@/lib/staff/service";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

function failure(error: unknown): ActionResult {
  if (error instanceof AuthorizationError) return { ok: false, error: error.message };
  if (error instanceof z.ZodError) return { ok: false, error: error.issues[0]?.message ?? "Invalid input." };
  if (error instanceof Error && error.message === "This person is already a staff member.") {
    return { ok: false, error: error.message };
  }
  console.error("[staff action]", error);
  return { ok: false, error: "Something went wrong. Please try again." };
}

const createSchema = z.object({
  displayName: z.string().trim().min(2, "Enter the staff member's name.").max(80),
  email: z.email("Enter a valid email address.").trim().toLowerCase(),
  roleId: z.enum(ROLE_IDS),
});

export async function createStaffAction(input: z.input<typeof createSchema>): Promise<ActionResult> {
  try {
    const actor = await assertPermission("staff:create");
    const data = createSchema.parse(input);
    if (data.roleId === "super_admin" && actor.roleId !== "super_admin") {
      throw new AuthorizationError("Only a Super Admin can grant the Super Admin role.");
    }

    const { uid, createdAuthUser } = await createStaffMember({ ...data, createdBy: actor.uid });
    await logActivity({
      action: "staff.created",
      actorId: actor.uid,
      actorEmail: actor.email,
      targetType: "staff",
      targetId: uid,
      summary: `Added ${data.email} as ${data.roleId}`,
      metadata: { roleId: data.roleId, createdAuthUser },
    });
    refresh();
    return {
      ok: true,
      message: createdAuthUser
        ? "Staff account created. A password setup email is being sent."
        : "Existing account granted staff access.",
    };
  } catch (error) {
    return failure(error);
  }
}

const roleSchema = z.object({ uid: z.string().min(1).max(128), roleId: z.enum(ROLE_IDS) });

export async function changeRoleAction(input: z.input<typeof roleSchema>): Promise<ActionResult> {
  try {
    const actor = await assertPermission("staff:edit");
    const { uid, roleId } = roleSchema.parse(input);
    if (uid === actor.uid) throw new AuthorizationError("You can't change your own role.");

    const ref = adminDb.collection(COLLECTIONS.staff).doc(uid);
    const snap = await ref.get();
    if (!snap.exists) return { ok: false, error: "Staff member not found." };
    const previous = snap.get("roleId");
    if (previous === roleId) return { ok: true, message: "Role unchanged." };

    const touchesSuperAdmin = roleId === "super_admin" || previous === "super_admin";
    if (touchesSuperAdmin && actor.roleId !== "super_admin") {
      throw new AuthorizationError("Only a Super Admin can grant or remove the Super Admin role.");
    }
    if (previous === "super_admin" && snap.get("status") === "active" && (await countActiveSuperAdmins()) <= 1) {
      return { ok: false, error: "At least one active Super Admin must remain." };
    }

    await ref.update({ roleId, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid });
    await syncClaims(uid, roleId);
    await adminAuth.revokeRefreshTokens(uid); // existing sessions must pick up the new role
    await logActivity({
      action: "staff.role_changed",
      actorId: actor.uid,
      actorEmail: actor.email,
      targetType: "staff",
      targetId: uid,
      summary: `Role changed from ${previous} to ${roleId}`,
      metadata: { from: previous, to: roleId },
    });
    refresh();
    return { ok: true, message: "Role updated. The staff member must sign in again." };
  } catch (error) {
    return failure(error);
  }
}

const statusSchema = z.object({ uid: z.string().min(1).max(128), status: z.enum(["active", "disabled"]) });

export async function setStatusAction(input: z.input<typeof statusSchema>): Promise<ActionResult> {
  try {
    const actor = await assertPermission("staff:edit");
    const { uid, status } = statusSchema.parse(input);
    if (uid === actor.uid) throw new AuthorizationError("You can't disable your own account.");

    const ref = adminDb.collection(COLLECTIONS.staff).doc(uid);
    const snap = await ref.get();
    if (!snap.exists) return { ok: false, error: "Staff member not found." };
    const roleId = snap.get("roleId");
    if (roleId === "super_admin" && actor.roleId !== "super_admin") {
      throw new AuthorizationError("Only a Super Admin can change another Super Admin's access.");
    }
    if (status === "disabled" && roleId === "super_admin" && (await countActiveSuperAdmins()) <= 1) {
      return { ok: false, error: "At least one active Super Admin must remain." };
    }

    await ref.update({ status, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid });
    await adminAuth.updateUser(uid, { disabled: status === "disabled" });
    await syncClaims(uid, status === "active" ? roleId : null);
    if (status === "disabled") await adminAuth.revokeRefreshTokens(uid);
    await logActivity({
      action: status === "disabled" ? "staff.disabled" : "staff.enabled",
      actorId: actor.uid,
      actorEmail: actor.email,
      targetType: "staff",
      targetId: uid,
      summary: status === "disabled" ? "Staff access disabled" : "Staff access restored",
    });
    refresh();
    return { ok: true, message: status === "disabled" ? "Access disabled and sessions revoked." : "Access restored." };
  } catch (error) {
    return failure(error);
  }
}
