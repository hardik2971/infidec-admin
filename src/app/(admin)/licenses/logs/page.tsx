import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePermission } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/format";
import { listVerificationLogs } from "@/lib/licenses/verification";
import { listProducts } from "@/lib/products/service";

export const metadata: Metadata = { title: "Verification Logs" };

const RESULT: Record<string, { label: string; className: string }> = {
  valid: { label: "Valid", className: "border-success/40 text-success" },
  already_recorded: { label: "Already recorded", className: "border-primary/40 text-primary" },
  invalid: { label: "Invalid", className: "border-destructive/40 text-destructive" },
  invalid_format: { label: "Bad format", className: "border-destructive/40 text-destructive" },
  error: { label: "API error", className: "border-warning/40 text-warning" },
};

async function Logs() {
  await requirePermission("licenses:view");
  const [logs, products] = await Promise.all([listVerificationLogs(), listProducts()]);
  const names = new Map(products.map((p) => [p.id, p.name]));
  if (!logs.length) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>No verifications yet</EmptyTitle>
          <EmptyDescription>Every purchase-code check is recorded here, whatever the result.</EmptyDescription>
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
            <TableHead>Code</TableHead>
            <TableHead>Result</TableHead>
            <TableHead>Item / product</TableHead>
            <TableHead>Buyer · license</TableHead>
            <TableHead>Checked by</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((l) => {
            const r = RESULT[l.result] ?? { label: l.result, className: "" };
            return (
              <TableRow key={l.id}>
                <TableCell className="text-xs text-muted-foreground tabular">{formatDateTime(l.createdAt)}</TableCell>
                <TableCell className="font-mono text-xs">…{l.codeLast4}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={r.className}>
                    {r.label}
                  </Badge>
                  {l.error && <p className="mt-1 max-w-56 text-xs text-muted-foreground">{l.error}</p>}
                </TableCell>
                <TableCell className="text-sm">
                  {l.itemName ?? "—"}
                  {l.productId && <p className="text-xs text-muted-foreground">→ {names.get(l.productId) ?? "product"}</p>}
                </TableCell>
                <TableCell className="text-xs">{l.buyer ? `${l.buyer} · ${l.license}` : "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{l.verifiedByEmail}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}

export default function LogsPage() {
  return (
    <>
      <PageHeader title="Verification Logs" description="An audit trail of every purchase-code verification. Codes are shown by their last four characters only." />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <Logs />
      </Suspense>
    </>
  );
}
