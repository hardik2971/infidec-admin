import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePermission } from "@/lib/auth/session";
import { DENY_MESSAGES, listDownloadLogs, type DenyReason } from "@/lib/downloads/service";
import { formatDateTime } from "@/lib/format";
import { listProducts } from "@/lib/products/service";
import { listCustomers } from "@/lib/sales/service";

export const metadata: Metadata = { title: "Download History" };

async function History() {
  await requirePermission("downloads:view");
  const [logs, customers, products] = await Promise.all([listDownloadLogs(), listCustomers(), listProducts()]);
  const cust = new Map(customers.map((c) => [c.id, c.name]));
  const prod = new Map(products.map((p) => [p.id, p.name]));
  if (!logs.length) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>No downloads yet</EmptyTitle>
          <EmptyDescription>Every authorized or denied download request is recorded here.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <Card className="p-0">
      <Table>
        <TableHeader className="bg-muted/40">
          <TableRow>
            <TableHead>When</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Package</TableHead>
            <TableHead>Result</TableHead>
            <TableHead>Requested by</TableHead>
            <TableHead>IP</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((l) => (
            <TableRow key={l.id}>
              <TableCell className="text-xs text-muted-foreground tabular">{formatDateTime(l.createdAt)}</TableCell>
              <TableCell>
                <Link href={`/customers/${l.customerId}`} className="text-sm hover:text-primary">
                  {cust.get(l.customerId) ?? "—"}
                </Link>
              </TableCell>
              <TableCell className="text-sm">
                {l.fileName ?? l.packageId}
                {l.productId && (
                  <p className="text-xs text-muted-foreground">
                    {prod.get(l.productId)} · v{l.version}
                  </p>
                )}
              </TableCell>
              <TableCell>
                {l.result === "authorized" ? (
                  <Badge variant="outline" className="border-success/40 text-success">Authorized</Badge>
                ) : (
                  <div>
                    <Badge variant="outline" className="border-destructive/40 text-destructive">Denied</Badge>
                    <p className="mt-1 text-xs text-muted-foreground">{DENY_MESSAGES[l.reason as DenyReason] ?? l.reason}</p>
                  </div>
                )}
              </TableCell>
              <TableCell className="text-xs">{l.issuedBy === "customer" ? "Customer" : (l.issuedByEmail ?? "Staff")}</TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">{l.ip ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

export default function HistoryPage() {
  return (
    <>
      <PageHeader title="Download History" description="Every download request, with its entitlement decision. Links themselves are never stored." />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <History />
      </Suspense>
    </>
  );
}
