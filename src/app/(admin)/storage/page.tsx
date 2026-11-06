import { Archive, FileArchive, HardDrive, Image as ImageIcon, Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePermission } from "@/lib/auth/session";
import { adminStorage } from "@/lib/firebase/admin";
import { formatBytes } from "@/lib/format";
import { STORAGE_RULES_MAX_MB, getStorageUsage, getUploadSettings } from "@/lib/packages/service";
import { listProducts } from "@/lib/products/service";
import { hasPermission } from "@/lib/rbac/permissions";
import { StagingCleanup, UploadLimitForm } from "./storage-controls";

export const metadata: Metadata = { title: "Storage Management" };

async function StorageContent() {
  const session = await requirePermission("storage:view");
  const [usage, products, settings] = await Promise.all([getStorageUsage(), listProducts(), getUploadSettings()]);
  const names = new Map(products.map((p) => [p.id, p.name]));
  const total = usage.totals.packageBytes + usage.totals.historyBytes + usage.totals.mediaBytes + usage.staging.bytes;
  const rows = usage.products
    .map((r) => ({ ...r, name: names.get(r.productId) ?? "Deleted product", total: r.activeBytes + r.historyBytes + r.mediaBytes }))
    .sort((a, b) => b.total - a.total);
  const max = Math.max(1, ...rows.map((r) => r.total));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total stored" icon={HardDrive} tone="primary" value={formatBytes(total)} hint={`Bucket ${adminStorage.bucket().name}`} />
        <StatCard label="Active source packages" icon={FileArchive} tone="violet" value={formatBytes(usage.totals.packageBytes)} />
        <StatCard label="Replaced (history)" icon={Archive} value={formatBytes(usage.totals.historyBytes)} hint="Kept for previous downloads" />
        <StatCard label="Product media" icon={ImageIcon} tone="cyan" value={formatBytes(usage.totals.mediaBytes)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-[15px]">Usage by product</CardTitle>
          <CardDescription>Calculated from package and media records — every file in Storage has a matching record.</CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing stored yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="w-1/3">Share</TableHead>
                  <TableHead className="text-right">Packages</TableHead>
                  <TableHead className="text-right">History</TableHead>
                  <TableHead className="text-right">Media</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.productId}>
                    <TableCell className="font-medium">
                      <Link href={`/packages?product=${r.productId}`} className="hover:text-primary">
                        {r.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="flex h-2 overflow-hidden rounded-full bg-muted">
                        <div className="bg-chart-3" style={{ width: `${(r.activeBytes / max) * 100}%` }} />
                        <div className="bg-chart-3/40" style={{ width: `${(r.historyBytes / max) * 100}%` }} />
                        <div className="bg-chart-2" style={{ width: `${(r.mediaBytes / max) * 100}%` }} />
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-sm tabular">
                      {formatBytes(r.activeBytes)} <span className="text-xs text-muted-foreground">({r.activeCount})</span>
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground tabular">{formatBytes(r.historyBytes)}</TableCell>
                    <TableCell className="text-right text-sm tabular">
                      {formatBytes(r.mediaBytes)} <span className="text-xs text-muted-foreground">({r.mediaCount})</span>
                    </TableCell>
                    <TableCell className="text-right font-medium tabular">{formatBytes(r.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-[15px]">Upload staging</CardTitle>
            <CardDescription>Uploads wait here until the server validates them. Abandoned uploads older than 24 hours can be removed.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border p-3">
                <dt className="text-xs text-muted-foreground">In staging</dt>
                <dd className="mt-1 font-medium tabular">
                  {usage.staging.files} file(s) · {formatBytes(usage.staging.bytes)}
                </dd>
              </div>
              <div className="rounded-lg border p-3">
                <dt className="text-xs text-muted-foreground">Abandoned (24h+)</dt>
                <dd className="mt-1 font-medium tabular">
                  {usage.staging.stale} file(s) · {formatBytes(usage.staging.staleBytes)}
                </dd>
              </div>
            </dl>
            {hasPermission(session.permissions, "storage:delete") && <StagingCleanup stale={usage.staging.stale} />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-[15px]">Upload limit</CardTitle>
            <CardDescription>Maximum size of a single source package. The Storage rules cap this at {STORAGE_RULES_MAX_MB / 1024} GB.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <UploadLimitForm current={settings.maxUploadSizeMb} max={STORAGE_RULES_MAX_MB} canEdit={hasPermission(session.permissions, "storage:manage_settings")} />
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Lock className="size-3.5" /> All files are private. Downloads use signed links valid for {settings.signedUrlTtlMinutes} minutes.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function StoragePage() {
  return (
    <>
      <PageHeader title="Storage Management" description="Where your Firebase Storage is going: source packages, their history, product media and upload staging." />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <StorageContent />
      </Suspense>
    </>
  );
}
