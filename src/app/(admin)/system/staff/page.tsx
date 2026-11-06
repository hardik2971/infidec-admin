import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { requirePermission } from "@/lib/auth/session";
import { hasPermission } from "@/lib/rbac/permissions";
import { DEFAULT_ROLES, ROLE_IDS } from "@/lib/rbac/roles";
import { listStaff } from "@/lib/staff/service";
import { StaffTable } from "./staff-table";

export const metadata: Metadata = { title: "Staff Management" };

async function StaffContent() {
  const session = await requirePermission("staff:view");
  const staff = await listStaff();
  const roles = ROLE_IDS.map((id) => ({ id, name: DEFAULT_ROLES[id].name }));

  return (
    <StaffTable
      staff={staff}
      roles={roles}
      currentUid={session.uid}
      isSuperAdmin={session.roleId === "super_admin"}
      canCreate={hasPermission(session.permissions, "staff:create")}
      canEdit={hasPermission(session.permissions, "staff:edit")}
    />
  );
}

export default function StaffPage() {
  return (
    <>
      <PageHeader
        title="Staff Management"
        description="Invite staff, assign roles and control access. Role and access changes sign the person out of every device."
      />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <StaffContent />
      </Suspense>
    </>
  );
}
