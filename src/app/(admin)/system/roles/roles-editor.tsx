"use client";

import { Lock, RotateCcw, Save, ShieldCheck, Users } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ACTIONS, ACTION_LABELS, MODULES, MODULE_ACTIONS, MODULE_LABELS, type Permission } from "@/lib/rbac/permissions";
import type { RoleId } from "@/lib/rbac/roles";
import type { RoleView } from "@/lib/rbac/store";
import { cn } from "@/lib/utils";
import { updateRolePermissionsAction } from "./actions";

export function RolesEditor({
  roles,
  canEdit,
  actorRoleId,
  actorPermissions,
}: {
  roles: RoleView[];
  canEdit: boolean;
  actorRoleId: RoleId;
  actorPermissions: string[];
}) {
  const [selectedId, setSelectedId] = useState<RoleId>(roles.find((r) => r.id !== "super_admin")?.id ?? roles[0].id);
  const selected = roles.find((r) => r.id === selectedId)!;
  const [draft, setDraft] = useState<Set<string>>(new Set(selected.permissions));
  const [pending, startTransition] = useTransition();

  // Resync the draft when saved permissions change on the server (e.g. after a reset).
  const savedKey = `${selected.id}:${selected.permissions.join("|")}`;
  const [syncedKey, setSyncedKey] = useState(savedKey);
  if (syncedKey !== savedKey) {
    setSyncedKey(savedKey);
    setDraft(new Set(selected.permissions));
  }

  const isWildcard = selected.permissions.includes("*");
  const editable = canEdit && !selected.locked && selected.id !== actorRoleId;
  const canGrant = (p: string) => actorRoleId === "super_admin" || actorPermissions.includes(p);
  const dirty = !isWildcard && [...draft].sort().join("|") !== [...selected.permissions].sort().join("|");

  function select(id: RoleId) {
    setSelectedId(id);
    setDraft(new Set(roles.find((r) => r.id === id)!.permissions));
  }

  function toggle(p: Permission, on: boolean) {
    setDraft((prev) => {
      const next = new Set(prev);
      if (on) next.add(p);
      else next.delete(p);
      return next;
    });
  }

  function save(reset = false) {
    startTransition(async () => {
      const result = await updateRolePermissionsAction({ roleId: selected.id, permissions: [...draft], reset });
      if (result.ok) toast.success(result.message);
      else toast.error(result.error);
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
      <nav aria-label="Roles" className="space-y-1.5">
        {roles.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => select(r.id)}
            className={cn(
              "w-full rounded-xl border px-3.5 py-3 text-left transition-colors",
              r.id === selectedId ? "border-primary/40 bg-accent shadow-xs" : "border-transparent hover:bg-muted/60",
            )}
            aria-current={r.id === selectedId}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                {r.locked && <ShieldCheck className="size-3.5 text-primary" />}
                {r.name}
              </span>
              <span className="flex items-center gap-1 text-xs text-muted-foreground tabular">
                <Users className="size-3" /> {r.memberCount}
              </span>
            </div>
            {r.customised && <span className="mt-1 inline-block text-[11px] text-chart-3">Customised</span>}
          </button>
        ))}
      </nav>

      <Card className="gap-0 overflow-hidden p-0">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b p-5">
          <div className="space-y-1">
            <h2 className="flex items-center gap-2 font-semibold">
              {selected.name}
              {selected.locked && (
                <Badge variant="secondary" className="gap-1">
                  <Lock className="size-3" /> System role
                </Badge>
              )}
            </h2>
            <p className="max-w-xl text-sm text-muted-foreground">{selected.description}</p>
            {selected.id === actorRoleId && !selected.locked && (
              <p className="text-xs text-muted-foreground">You can&apos;t edit the role you&apos;re signed in with.</p>
            )}
          </div>
          {editable && (
            <div className="flex gap-2">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" disabled={pending || !selected.customised}>
                    <RotateCcw /> Reset
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Reset {selected.name} to defaults?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Custom permission changes for this role will be replaced with the INFIDEC defaults. This affects{" "}
                      {selected.memberCount} staff member{selected.memberCount === 1 ? "" : "s"}.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => save(true)}>Reset role</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <Button size="sm" onClick={() => save(false)} disabled={pending || !dirty}>
                {pending ? <Spinner /> : <Save />} Save changes
              </Button>
            </div>
          )}
        </div>

        {isWildcard ? (
          <div className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
            <ShieldCheck className="size-5 text-primary" />
            Super Admin has every permission in every module, including ones added in future phases.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="sticky left-0 z-10 min-w-44 bg-muted/40 text-xs">Module</TableHead>
                  {ACTIONS.map((a) => (
                    <TableHead key={a} className="text-center text-xs whitespace-nowrap">
                      {ACTION_LABELS[a]}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {MODULES.map((m) => (
                  <TableRow key={m}>
                    <TableCell className="sticky left-0 z-10 bg-card font-medium">{MODULE_LABELS[m]}</TableCell>
                    {ACTIONS.map((a) => {
                      if (!MODULE_ACTIONS[m].includes(a)) {
                        return (
                          <TableCell key={a} className="text-center text-muted-foreground/30" aria-hidden>
                            ·
                          </TableCell>
                        );
                      }
                      const p = `${m}:${a}` as Permission;
                      const locked = p === "dashboard:view" || !canGrant(p);
                      return (
                        <TableCell key={a} className="text-center">
                          <Checkbox
                            checked={draft.has(p)}
                            disabled={!editable || pending || locked}
                            onCheckedChange={(v) => toggle(p, v === true)}
                            aria-label={`${MODULE_LABELS[m]}: ${ACTION_LABELS[a]}`}
                          />
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
