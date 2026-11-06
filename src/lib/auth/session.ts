import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { hasPermission, type Permission } from "@/lib/rbac/permissions";
import { DEFAULT_ROLES, isRoleId, type RoleId } from "@/lib/rbac/roles";
import { SESSION_COOKIE_NAME } from "./constants";

/** The narrow staff shape that is safe to hand to Server and Client Components. */
export interface StaffSession {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  roleId: RoleId;
  roleName: string;
  permissions: string[];
}

/**
 * Data Access Layer: verifies the session cookie (including revocation),
 * then loads the staff record and its role. Deduplicated per request.
 * Returns null for any invalid, revoked, disabled or non-staff session.
 */
export const getStaffSession = cache(async (): Promise<StaffSession | null> => {
  const cookie = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!cookie) return null;

  // Verification checks expiry against the clock, so it must run per request,
  // never during (runtime) prefetch prerendering.
  await connection();

  let decoded;
  try {
    decoded = await adminAuth.verifySessionCookie(cookie, true);
  } catch {
    return null;
  }

  const staffSnap = await adminDb.collection(COLLECTIONS.staff).doc(decoded.uid).get();
  const staff = staffSnap.data();
  if (!staff || staff.status !== "active" || !isRoleId(staff.roleId)) return null;

  const roleId: RoleId = staff.roleId;
  const roleSnap = await adminDb.collection(COLLECTIONS.roles).doc(roleId).get();
  const role = roleSnap.data();
  // Super Admin is always unrestricted, even if its Firestore document drifts.
  const permissions: string[] =
    roleId === "super_admin"
      ? ["*"]
      : Array.isArray(role?.permissions)
        ? role.permissions
        : DEFAULT_ROLES[roleId].permissions;

  return {
    uid: decoded.uid,
    email: decoded.email ?? staff.email ?? "",
    displayName: staff.displayName ?? decoded.name ?? decoded.email ?? "Staff",
    photoURL: staff.photoURL ?? decoded.picture ?? null,
    roleId,
    roleName: role?.name ?? DEFAULT_ROLES[roleId].name,
    permissions,
  };
});

/** Use in pages and layouts: redirects to login when unauthenticated. */
export async function requireStaff(): Promise<StaffSession> {
  const session = await getStaffSession();
  if (!session) redirect("/login");
  return session;
}

/** Use in pages: sends the user to the access-denied page when the permission is missing. */
export async function requirePermission(permission: Permission): Promise<StaffSession> {
  const session = await requireStaff();
  if (!hasPermission(session.permissions, permission)) redirect("/access-denied");
  return session;
}

export class AuthorizationError extends Error {
  constructor(message = "You do not have permission to perform this action.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

/** Use in Server Actions and Route Handlers: throws instead of redirecting. */
export async function assertPermission(permission: Permission): Promise<StaffSession> {
  const session = await getStaffSession();
  if (!session) throw new AuthorizationError("Your session has expired. Please sign in again.");
  if (!hasPermission(session.permissions, permission)) throw new AuthorizationError();
  return session;
}
