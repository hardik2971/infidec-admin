import "server-only";

import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { isPermission } from "./permissions";
import { DEFAULT_ROLES, ROLE_IDS, type RoleId } from "./roles";

export interface RoleView {
  id: RoleId;
  name: string;
  description: string;
  permissions: string[];
  locked: boolean;
  memberCount: number;
  customised: boolean;
}

/** Roles as stored in Firestore, falling back to code defaults for unseeded roles. */
export async function listRoles(): Promise<RoleView[]> {
  const [rolesSnap, staffSnap] = await Promise.all([
    adminDb.collection(COLLECTIONS.roles).get(),
    adminDb.collection(COLLECTIONS.staff).where("status", "==", "active").select("roleId").get(),
  ]);
  const stored = new Map(rolesSnap.docs.map((d) => [d.id, d.data()]));
  const members = new Map<string, number>();
  for (const d of staffSnap.docs) members.set(d.get("roleId"), (members.get(d.get("roleId")) ?? 0) + 1);

  return ROLE_IDS.map((id) => {
    const def = DEFAULT_ROLES[id];
    const doc = stored.get(id);
    const permissions: string[] = id === "super_admin"
      ? ["*"]
      : Array.isArray(doc?.permissions)
        ? doc.permissions.filter((p: unknown) => typeof p === "string" && isPermission(p))
        : def.permissions;
    const defaults = [...def.permissions].sort().join("|");
    return {
      id,
      name: def.name,
      description: def.description,
      permissions,
      locked: def.locked,
      memberCount: members.get(id) ?? 0,
      customised: id !== "super_admin" && [...permissions].sort().join("|") !== defaults,
    };
  });
}
