import { ArrowLeft, Bug, Sparkles, Wrench } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { VersionStatusBadge } from "@/components/packages/version-status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePermission } from "@/lib/auth/session";
import { formatBytes } from "@/lib/format";
import { PACKAGE_TYPES, PACKAGE_TYPE_LABELS, compareSemver, type PackageRecord, type VersionRecord } from "@/lib/packages/schema";
import { listPackages } from "@/lib/packages/service";
import { getVersion } from "@/lib/packages/versions";
import { getProduct } from "@/lib/products/service";

export const metadata: Metadata = { title: "Compare versions" };

function ChangeList({ icon: Icon, title, items }: { icon: typeof Sparkles; title: string; items: string[] }) {
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className="size-3.5" /> {title} ({items.length})
      </p>
      {items.length ? (
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {items.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">—</p>
      )}
    </div>
  );
}

function VersionColumn({ v }: { v: VersionRecord }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <Link href={`/versions/${v.id}`} className="font-mono text-lg hover:text-primary">
            v{v.version}
          </Link>
          <VersionStatusBadge status={v.status} />
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {v.title || "Untitled release"} · {v.releaseDate || "no release date"}
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {v.releaseNotes && <p className="text-sm whitespace-pre-line">{v.releaseNotes}</p>}
        <ChangeList icon={Sparkles} title="New features" items={v.newFeatures} />
        <ChangeList icon={Wrench} title="Improvements" items={v.improvements} />
        <ChangeList icon={Bug} title="Bug fixes" items={v.bugFixes} />
      </CardContent>
    </Card>
  );
}

function PackageCell({ pkg }: { pkg?: PackageRecord }) {
  if (!pkg) return <span className="text-sm text-muted-foreground">—</span>;
  return (
    <div className="text-sm">
      <p className="max-w-56 truncate font-mono text-xs">{pkg.fileName}</p>
      <p className="text-xs text-muted-foreground tabular">
        {formatBytes(pkg.fileSize)} · {pkg.sha256.slice(0, 10)}…
      </p>
    </div>
  );
}

async function Compare({ searchParams }: { searchParams: PageProps<"/versions/compare">["searchParams"] }) {
  await requirePermission("versions:view");
  const sp = await searchParams;
  const [x, y] = await Promise.all([getVersion(String(sp.a ?? "")), getVersion(String(sp.b ?? ""))]);
  if (!x || !y || x.productId !== y.productId) notFound();
  const [older, newer] = compareSemver(x.version, y.version) <= 0 ? [x, y] : [y, x];
  const [product, oldPkgs, newPkgs] = await Promise.all([
    getProduct(older.productId),
    listPackages({ versionId: older.id }),
    listPackages({ versionId: newer.id }),
  ]);

  const rows = PACKAGE_TYPES.flatMap((type) => {
    const a = oldPkgs.filter((p) => p.packageType === type);
    const b = newPkgs.filter((p) => p.packageType === type);
    const n = Math.max(a.length, b.length);
    return Array.from({ length: n }, (_, i) => ({ type, a: a[i], b: b[i] }));
  });

  return (
    <div className="space-y-6">
      <Link href={`/versions?product=${older.productId}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {product?.name ?? "Product"} versions
      </Link>
      <div className="grid gap-4 lg:grid-cols-2">
        <VersionColumn v={older} />
        <VersionColumn v={newer} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-[15px]">Packages</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Neither version has packages yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead className="font-mono">v{older.version}</TableHead>
                  <TableHead className="font-mono">v{newer.version}</TableHead>
                  <TableHead>Change</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => {
                  const change = !r.a ? "Added" : !r.b ? "Removed" : r.a.sha256 === r.b.sha256 ? "Identical" : "Updated";
                  return (
                    <TableRow key={`${r.type}-${i}`}>
                      <TableCell className="font-medium">{PACKAGE_TYPE_LABELS[r.type]}</TableCell>
                      <TableCell>
                        <PackageCell pkg={r.a} />
                      </TableCell>
                      <TableCell>
                        <PackageCell pkg={r.b} />
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            change === "Added"
                              ? "border-success/40 text-success"
                              : change === "Removed"
                                ? "border-destructive/40 text-destructive"
                                : change === "Updated"
                                  ? "border-primary/40 text-primary"
                                  : "text-muted-foreground"
                          }
                        >
                          {change}
                          {change === "Updated" && r.a && r.b && ` (${r.b.fileSize >= r.a.fileSize ? "+" : "−"}${formatBytes(Math.abs(r.b.fileSize - r.a.fileSize))})`}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function ComparePage(props: PageProps<"/versions/compare">) {
  return (
    <>
      <PageHeader title="Compare versions" description="Release notes and packages side by side. Packages are matched by type; identical files share a SHA-256." />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <Compare searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}
