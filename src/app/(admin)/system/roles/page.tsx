import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { requirePermission } from "@/lib/auth/session";
import { hasPermission } from "@/lib/rbac/permissions";
import { listRoles } from "@/lib/rbac/store";
import { RolesEditor } from "./roles-editor";

export const metadata: Metadata = { title: "Roles & Permissions" };

async function RolesContent() {
  const session = await requirePermission("roles:view");
  const roles = await listRoles();
  return (
    <RolesEditor
      roles={roles}
      canEdit={hasPermission(session.permissions, "roles:edit")}
      actorRoleId={session.roleId}
      actorPermissions={session.permissions}
    />
  );
}

export default function RolesPage() {
  return (
    <>
      <PageHeader
        title="Roles & Permissions"
        description="Each staff member has one role. Permissions are checked on the server for every page and action — the interface only hides what a role can't use."
      />
      <Suspense fallback={<Skeleton className="h-[32rem] w-full rounded-xl" />}>
        <RolesContent />
      </Suspense>
    </>
  );
}
