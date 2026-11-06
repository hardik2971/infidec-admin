import { FileArchive, FileText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePermission } from "@/lib/auth/session";
import { listDocs } from "@/lib/docs/service";
import { formatBytes, formatDateTime } from "@/lib/format";
import { listPackages } from "@/lib/packages/service";
import { listProducts } from "@/lib/products/service";
import { hasPermission } from "@/lib/rbac/permissions";

export const metadata: Metadata = { title: "Document Library" };

async function Library() {
  const session = await requirePermission("documentation:view");
  const [docs, products, packages] = await Promise.all([listDocs(), listProducts(), listPackages()]);
  const names = new Map(products.map((p) => [p.id, p.name]));
  const canPackages = hasPermission(session.permissions, "packages:download");
  const rows = [
    ...docs.flatMap((d) =>
      d.attachments.map((a) => ({
        key: a.id,
        productId: d.productId,
        name: a.fileName,
        kind: a.contentType === "application/pdf" ? "PDF" : "ZIP",
        size: a.size,
        where: { label: d.title, href: `/documentation?product=${d.productId}&doc=${d.id}` },
        download: `/api/docs/${d.id}/attachments/${a.id}`,
        date: a.uploadedAt,
      })),
    ),
    ...packages
      .filter((p) => p.packageType === "documentation")
      .map((p) => ({
        key: p.id,
        productId: p.productId,
        name: p.fileName,
        kind: "Documentation package",
        size: p.fileSize,
        where: { label: `v${p.version}`, href: `/versions/${p.versionId}` },
        download: canPackages ? `/api/packages/${p.id}/download` : null,
        date: p.createdAt,
      })),
  ].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  if (!rows.length) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileText />
          </EmptyMedia>
          <EmptyTitle>No documents yet</EmptyTitle>
          <EmptyDescription>Attach PDF manuals or ZIP bundles to documentation pages, or upload Documentation packages to a version.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <Card className="p-0">
      <Table>
        <TableHeader className="bg-muted/40">
          <TableRow>
            <TableHead>File</TableHead>
            <TableHead>Product</TableHead>
            <TableHead>Attached to</TableHead>
            <TableHead className="text-right">Size</TableHead>
            <TableHead>Added</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.key}>
              <TableCell>
                <div className="flex items-center gap-2.5">
                  {r.kind === "PDF" ? <FileText className="size-4 text-destructive" /> : <FileArchive className="size-4 text-primary" />}
                  {r.download ? (
                    <a href={r.download} className="font-medium hover:text-primary" target="_blank" rel="noreferrer">
                      {r.name}
                    </a>
                  ) : (
                    <span className="font-medium">{r.name}</span>
                  )}
                  <Badge variant="outline" className="text-[10.5px]">
                    {r.kind}
                  </Badge>
                </div>
              </TableCell>
              <TableCell className="text-sm">{names.get(r.productId) ?? "—"}</TableCell>
              <TableCell>
                <Link href={r.where.href} className="text-sm text-muted-foreground hover:text-primary">
                  {r.where.label}
                </Link>
              </TableCell>
              <TableCell className="text-right text-sm tabular">{formatBytes(r.size)}</TableCell>
              <TableCell className="text-xs text-muted-foreground tabular">{formatDateTime(r.date)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

export default function LibraryPage() {
  return (
    <>
      <PageHeader title="Document Library" description="Every PDF manual, documentation ZIP and documentation package across all products." />
      <Suspense fallback={<Skeleton className="h-80 w-full rounded-xl" />}>
        <Library />
      </Suspense>
    </>
  );
}
