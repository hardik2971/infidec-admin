"use server";

import { FieldValue } from "firebase-admin/firestore";
import { refresh } from "next/cache";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { AuthorizationError, assertPermission } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { ALL_PERMISSIONS } from "@/lib/rbac/permissions";
import { DEFAULT_ROLES, ROLE_IDS } from "@/lib/rbac/roles";

type Result = { ok: true; message: string } | { ok: false; error: string };

const schema = z.object({
  roleId: z.enum(ROLE_IDS),
  permissions: z.array(z.enum(ALL_PERMISSIONS as [string, ...string[]])).max(ALL_PERMISSIONS.length),
  reset: z.boolean().optional(),
});

export async function updateRolePermissionsAction(input: z.input<typeof schema>): Promise<Result> {
  try {
    const actor = await assertPermission("roles:edit");
    const { roleId, permissions, reset } = schema.parse(input);
    if (roleId === "super_admin") return { ok: false, error: "Super Admin permissions can't be changed." };
    if (actor.roleId === roleId) {
      throw new AuthorizationError("You can't change the permissions of your own role.");
    }

    const next = reset ? DEFAULT_ROLES[roleId].permissions : [...new Set(permissions)].sort();
    // Escalation guard: you can only grant permissions you hold yourself.
    if (actor.roleId !== "super_admin" && !next.every((p) => actor.permissions.includes(p))) {
      throw new AuthorizationError("You can only grant permissions that your own role has.");
    }
    // Every role needs to see the dashboard it lands on after sign-in.
    if (!next.includes("dashboard:view")) next.push("dashboard:view");

    const ref = adminDb.collection(COLLECTIONS.roles).doc(roleId);
    const previous: string[] = (await ref.get()).get("permissions") ?? DEFAULT_ROLES[roleId].permissions;

    await ref.set(
      {
        id: roleId,
        name: DEFAULT_ROLES[roleId].name,
        description: DEFAULT_ROLES[roleId].description,
        permissions: next,
        locked: false,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actor.uid,
      },
      { merge: true },
    );

    const added = next.filter((p) => !previous.includes(p));
    const removed = previous.filter((p) => !next.includes(p));
    await logActivity({
      action: "role.permissions_changed",
      actorId: actor.uid,
      actorEmail: actor.email,
      targetType: "role",
      targetId: roleId,
      summary: reset
        ? `Reset ${DEFAULT_ROLES[roleId].name} to default permissions`
        : `Updated ${DEFAULT_ROLES[roleId].name}: +${added.length} / -${removed.length}`,
      metadata: { added, removed },
    });
    refresh();
    return { ok: true, message: reset ? "Role reset to defaults." : "Permissions saved." };
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false, error: error.message };
    if (error instanceof z.ZodError) return { ok: false, error: "Invalid permission list." };
    console.error("[roles action]", error);
    return { ok: false, error: "Could not save permissions. Please try again." };
  }
}
