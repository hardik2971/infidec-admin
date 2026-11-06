"use client";

import { Archive, ArrowLeft, BellRing, CheckCircle2, RotateCcw, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteVersionAction, notifyVersionAction, setVersionStatusAction } from "@/app/(admin)/versions/actions";
import { PackageUploader, type UploaderVersion } from "@/components/packages/package-uploader";
import { PackagesTable, type PackageCaps } from "@/components/packages/packages-table";
import { VersionForm } from "@/components/packages/version-form";
import { VersionStatusBadge } from "@/components/packages/version-status-badge";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatBytes, formatDateTime } from "@/lib/format";
import type { PackageRecord, VersionRecord, VersionStatus } from "@/lib/packages/schema";

type Confirm = { status: VersionStatus; title: string; body: string } | { delete: true } | { notify: true } | null;

export function VersionDetail({
  version,
  product,
  packages,
  siblings,
  maxUploadSizeMb,
  caps,
}: {
  version: VersionRecord;
  product: { id: string; name: string; currentVersion: string };
  packages: PackageRecord[];
  siblings: UploaderVersion[];
  maxUploadSizeMb: number;
  caps: { canEditVersion: boolean; canPublish: boolean; canDelete: boolean; packages: PackageCaps };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const active = packages.filter((p) => p.status === "active");
  const deprecated = version.status === "deprecated";

  function changeStatus(status: VersionStatus) {
    startTransition(async () => {
      const r = await setVersionStatusAction({ versionId: version.id, status });
      if (r.ok) toast.success(r.message);
      else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-6">
      <Link href={`/versions?product=${product.id}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {product.name} versions
      </Link>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-2xl font-semibold tracking-tight">v{version.version}</h1>
            <VersionStatusBadge status={version.status} />
            {product.currentVersion === version.version && version.status === "published" && <Badge>Current</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">
            {product.name}
            {version.title && ` · ${version.title}`}
          </p>
          <p className="text-xs text-muted-foreground">
            {active.length} active package{active.length === 1 ? "" : "s"} · {formatBytes(version.packageBytes)} · created {formatDateTime(version.createdAt)}
            {version.publishedAt && ` · published ${formatDateTime(version.publishedAt)}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {caps.canPublish && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button variant="outline" disabled={pending || version.status !== "published"} onClick={() => setConfirm({ notify: true })}>
                    <BellRing /> Notify customers
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                {version.status === "published" ? "Email every customer with an active license for this product." : "Publish the version first."}
              </TooltipContent>
            </Tooltip>
          )}
          {caps.packages.canUpload && !deprecated && (
            <Button variant="outline" onClick={() => setUploading(true)}>
              <Upload /> Upload packages
            </Button>
          )}
          {caps.canPublish && version.status !== "published" && !deprecated && (
            <Button onClick={() => changeStatus("published")} disabled={pending || active.length === 0}>
              <CheckCircle2 /> Publish
            </Button>
          )}
          {caps.canPublish && version.status === "published" && (
            <Button
              variant="outline"
              disabled={pending}
              onClick={() =>
                setConfirm({
                  status: "deprecated",
                  title: `Deprecate v${version.version}?`,
                  body: "The version and its packages are kept for existing customers but no longer offered as current. New packages can't be added.",
                })
              }
            >
              <Archive /> Deprecate
            </Button>
          )}
          {caps.canEditVersion && version.status !== "draft" && (
            <Button variant="ghost" onClick={() => changeStatus("draft")} disabled={pending}>
              <RotateCcw /> Back to draft
            </Button>
          )}
          {caps.canDelete && version.status === "draft" && (
            <Button variant="ghost" size="icon" aria-label="Delete version" onClick={() => setConfirm({ delete: true })} disabled={pending}>
              <Trash2 />
            </Button>
          )}
        </div>
      </div>

      {version.status === "draft" && active.length === 0 && (
        <p className="rounded-xl border border-primary/25 bg-accent/60 px-4 py-3 text-sm text-accent-foreground">
          Upload at least one source package to publish this version.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-[15px]">Packages</CardTitle>
          <CardDescription>Including replaced and deleted files for this version&apos;s history.</CardDescription>
        </CardHeader>
        <CardContent>
          <PackagesTable
            packages={packages}
            productNames={{ [product.id]: product.name }}
            versions={siblings}
            caps={caps.packages}
            maxUploadSizeMb={maxUploadSizeMb}
            showProduct={false}
            emptyDescription="Upload the complete source and any app, panel or module ZIPs for this release."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-[15px]">Release notes</CardTitle>
          <CardDescription>Shown in changelogs and update notifications.</CardDescription>
        </CardHeader>
        <CardContent>
          <VersionForm key={version.id + version.version} productId={product.id} version={version} readOnly={!caps.canEditVersion} />
        </CardContent>
      </Card>

      <Dialog open={uploading} onOpenChange={setUploading}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Upload packages to {product.name} v{version.version}
            </DialogTitle>
            <DialogDescription>Each ZIP is validated, checksummed and filed under this version.</DialogDescription>
          </DialogHeader>
          <PackageUploader
            products={[]}
            versions={siblings}
            fixedProductId={product.id}
            fixedVersionId={version.id}
            maxUploadSizeMb={maxUploadSizeMb}
            onFinished={() => setUploading(false)}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm && "delete" in confirm
                ? `Delete draft v${version.version}?`
                : confirm && "notify" in confirm
                  ? `Email v${version.version} to license holders?`
                  : confirm?.title}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm && "delete" in confirm
                ? "Only empty draft versions can be deleted. This can't be undone."
                : confirm && "notify" in confirm
                  ? `Every customer with an active ${product.name} license receives the release notes by email. Refunded and revoked licenses are excluded.`
                  : confirm?.body}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={confirm && "delete" in confirm ? "destructive" : "default"}
              onClick={() => {
                const c = confirm;
                setConfirm(null);
                if (c && "notify" in c) {
                  startTransition(async () => {
                    const r = await notifyVersionAction(version.id);
                    if (r.ok) toast.success(r.message);
                    else toast.error(r.error);
                  });
                } else if (c && "delete" in c) {
                  startTransition(async () => {
                    const r = await deleteVersionAction(version.id);
                    if (r.ok) {
                      toast.success(r.message);
                      router.push(`/versions?product=${product.id}`);
                    } else toast.error(r.error);
                  });
                } else if (c) changeStatus(c.status);
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
