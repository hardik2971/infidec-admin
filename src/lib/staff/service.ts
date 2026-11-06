import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { DEFAULT_ROLES, isRoleId, type RoleId } from "@/lib/rbac/roles";

export type StaffStatus = "active" | "disabled";

export interface StaffRecord {
  uid: string;
  email: string;
  displayName: string;
  roleId: RoleId;
  roleName: string;
  status: StaffStatus;
  emailVerified: boolean;
  createdAt: string | null;
  lastLoginAt: string | null;
}

const iso = (v: unknown) => (v instanceof Timestamp ? v.toDate().toISOString() : null);

/** Keeps Auth custom claims identical to the staff document (Security Rules rely on them). */
export async function syncClaims(uid: string, roleId: RoleId | null) {
  const user = await adminAuth.getUser(uid);
  const rest: Record<string, unknown> = { ...user.customClaims };
  delete rest.staff;
  delete rest.role;
  await adminAuth.setCustomUserClaims(uid, roleId ? { ...rest, staff: true, role: roleId } : rest);
}

export async function listStaff(): Promise<StaffRecord[]> {
  const [snap, rolesSnap] = await Promise.all([
    adminDb.collection(COLLECTIONS.staff).orderBy("createdAt", "desc").limit(500).get(),
    adminDb.collection(COLLECTIONS.roles).get(),
  ]);
  const roleNames = new Map(rolesSnap.docs.map((d) => [d.id, String(d.get("name") ?? d.id)]));

  const users = snap.empty
    ? []
    : (await adminAuth.getUsers(snap.docs.map((d) => ({ uid: d.id })))).users;
  const verified = new Map(users.map((u) => [u.uid, u.emailVerified]));

  return snap.docs.map((d) => {
    const s = d.data();
    const roleId: RoleId = isRoleId(s.roleId) ? s.roleId : "read_only";
    return {
      uid: d.id,
      email: String(s.email ?? ""),
      displayName: String(s.displayName ?? s.email ?? ""),
      roleId,
      roleName: roleNames.get(roleId) ?? DEFAULT_ROLES[roleId].name,
      status: s.status === "active" ? "active" : "disabled",
      emailVerified: verified.get(d.id) ?? false,
      createdAt: iso(s.createdAt),
      lastLoginAt: iso(s.lastLoginAt),
    };
  });
}

export async function countActiveSuperAdmins(): Promise<number> {
  const snap = await adminDb
    .collection(COLLECTIONS.staff)
    .where("roleId", "==", "super_admin")
    .where("status", "==", "active")
    .count()
    .get();
  return snap.data().count;
}

export async function createStaffMember(input: {
  email: string;
  displayName: string;
  roleId: RoleId;
  createdBy: string;
}): Promise<{ uid: string; createdAuthUser: boolean }> {
  let uid: string;
  let createdAuthUser = false;
  try {
    uid = (await adminAuth.getUserByEmail(input.email)).uid;
  } catch (error) {
    if ((error as { code?: string }).code !== "auth/user-not-found") throw error;
    const user = await adminAuth.createUser({
      email: input.email,
      displayName: input.displayName,
      emailVerified: false,
      disabled: false,
    });
    uid = user.uid;
    createdAuthUser = true;
  }

  const ref = adminDb.collection(COLLECTIONS.staff).doc(uid);
  await adminDb.runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists) throw new Error("This person is already a staff member.");
    tx.set(ref, {
      uid,
      email: input.email,
      displayName: input.displayName,
      roleId: input.roleId,
      status: "active",
      createdBy: input.createdBy,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  await syncClaims(uid, input.roleId);
  return { uid, createdAuthUser };
}
