"use client";

import { MoreHorizontal, ShieldCheck, UserCheck, UserX } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { initials } from "@/components/layout/user-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDateTime } from "@/lib/format";
import type { RoleId } from "@/lib/rbac/roles";
import type { StaffRecord } from "@/lib/staff/service";
import { changeRoleAction, setStatusAction, type ActionResult } from "./actions";
import { AddStaffDialog } from "./add-staff-dialog";

interface Props {
  staff: StaffRecord[];
  roles: { id: RoleId; name: string }[];
  currentUid: string;
  isSuperAdmin: boolean;
  canCreate: boolean;
  canEdit: boolean;
}

export function StaffTable({ staff, roles, currentUid, isSuperAdmin, canCreate, canEdit }: Props) {
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState<StaffRecord | null>(null);

  function run(action: () => Promise<ActionResult>) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) toast.success(result.message ?? "Saved");
      else toast.error(result.error);
    });
  }

  const columns = useMemo<DataTableColumn<StaffRecord>[]>(
    () => [
      {
        accessorKey: "displayName",
        header: "Staff member",
        cell: ({ row }) => {
          const s = row.original;
          return (
            <div className="flex items-center gap-3">
              <Avatar className="size-8 rounded-lg">
                <AvatarFallback className="rounded-lg bg-accent text-xs font-semibold text-accent-foreground">
                  {initials(s.displayName)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {s.displayName}
                  {s.uid === currentUid && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span>}
                </p>
                <p className="truncate text-xs text-muted-foreground">{s.email}</p>
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: "roleName",
        header: "Role",
        cell: ({ row }) => (
          <Badge variant={row.original.roleId === "super_admin" ? "default" : "secondary"} className="gap-1">
            {row.original.roleId === "super_admin" && <ShieldCheck className="size-3" />}
            {row.original.roleName}
          </Badge>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => {
          const s = row.original;
          if (s.status === "disabled") return <Badge variant="outline" className="text-muted-foreground">Disabled</Badge>;
          if (!s.emailVerified)
            return <Badge variant="outline" className="border-warning/40 text-warning">Pending verification</Badge>;
          return <Badge variant="outline" className="border-success/40 text-success">Active</Badge>;
        },
      },
      {
        accessorKey: "lastLoginAt",
        header: "Last sign-in",
        cell: ({ row }) => <span className="text-sm text-muted-foreground tabular">{formatDateTime(row.original.lastLoginAt)}</span>,
      },
      {
        accessorKey: "createdAt",
        header: "Added",
        cell: ({ row }) => <span className="text-sm text-muted-foreground tabular">{formatDateTime(row.original.createdAt)}</span>,
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        cell: ({ row }) => {
          const s = row.original;
          const self = s.uid === currentUid;
          const protectedTarget = s.roleId === "super_admin" && !isSuperAdmin;
          if (!canEdit || self || protectedTarget) return null;
          return (
            <div className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${s.displayName}`} disabled={pending}>
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuLabel className="text-xs text-muted-foreground">{s.email}</DropdownMenuLabel>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <ShieldCheck /> Change role
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-52">
                      <DropdownMenuRadioGroup
                        value={s.roleId}
                        onValueChange={(roleId) => run(() => changeRoleAction({ uid: s.uid, roleId: roleId as RoleId }))}
                      >
                        {roles
                          .filter((r) => isSuperAdmin || r.id !== "super_admin")
                          .map((r) => (
                            <DropdownMenuRadioItem key={r.id} value={r.id}>
                              {r.name}
                            </DropdownMenuRadioItem>
                          ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuSeparator />
                  {s.status === "active" ? (
                    <DropdownMenuItem variant="destructive" onSelect={() => setConfirm(s)}>
                      <UserX /> Disable access
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onSelect={() => run(() => setStatusAction({ uid: s.uid, status: "active" }))}>
                      <UserCheck /> Restore access
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ],
    [currentUid, isSuperAdmin, canEdit, pending, roles],
  );

  return (
    <>
      <DataTable
        columns={columns}
        data={staff}
        searchText={(s) => `${s.displayName} ${s.email} ${s.roleName}`}
        searchPlaceholder="Search name or email…"
        emptyTitle="No staff yet"
        emptyDescription="Add your first staff member to share the workload."
        toolbar={canCreate ? <AddStaffDialog roles={roles.filter((r) => isSuperAdmin || r.id !== "super_admin")} /> : null}
      />

      <AlertDialog open={!!confirm} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable {confirm?.displayName}&apos;s access?</AlertDialogTitle>
            <AlertDialogDescription>
              They will be signed out of every device immediately and won&apos;t be able to sign in until access is
              restored. Their activity history is kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                const target = confirm;
                setConfirm(null);
                if (target) run(() => setStatusAction({ uid: target.uid, status: "disabled" }));
              }}
            >
              Disable access
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
