import type { Metadata } from "next";
import { Suspense } from "react";
import { ReportTable } from "@/components/reports/report-table";
import { logActivity } from "@/lib/activity";
import { requirePermission } from "@/lib/auth/session";
import { getProductOptions } from "@/lib/dashboard/data";
import { formatDateTime } from "@/lib/format";
import { buildReport } from "@/lib/reports/build";
import { REPORT_INFO, parseReportFilters } from "@/lib/reports/schema";
import { marketplaceLabel } from "@/lib/sales/schema";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Report" };

async function PrintableReport({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePermission("reports:export");
  const filters = parseReportFilters(await searchParams);
  const [report, products] = await Promise.all([buildReport(filters), getProductOptions().catch(() => [])]);
  const info = REPORT_INFO[filters.type];
  await logActivity({
    action: "report.exported",
    actorId: session.uid,
    actorEmail: session.email,
    targetType: "report",
    targetId: filters.type,
    summary: `Opened the ${report.title} report (${filters.from} – ${filters.to}) for PDF/print`,
  });
  const scope = [
    filters.productId ? (products.find((p) => p.id === filters.productId)?.name ?? "One product") : "All products",
    info.marketplaceFilter ? (filters.marketplace ? marketplaceLabel(filters.marketplace) : "All marketplaces") : null,
    info.dated ? `${filters.from} to ${filters.to}` : "Current totals",
  ].filter(Boolean);

  return (
    <div className="mx-auto max-w-[1100px] space-y-4 p-6 print:max-w-none print:p-0">
      <header className="flex items-start justify-between gap-4 border-b pb-3">
        <div>
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">INFIDEC Marketplace Admin</p>
          <h1 className="text-xl font-semibold">{report.title} report</h1>
          <p className="text-sm text-muted-foreground">{scope.join(" · ")}</p>
        </div>
        <div className="space-y-2 text-right">
          <PrintButton />
          <p className="text-xs text-muted-foreground">
            Generated {formatDateTime(report.generatedAt)} by {session.email}
            <br />
            {report.rows.length} row(s)
          </p>
        </div>
      </header>
      {report.rows.length === 0 ? <p className="text-sm text-muted-foreground">No records match these filters.</p> : <ReportTable report={report} dense />}
      <footer className="space-y-1 border-t pt-3 text-[11px] text-muted-foreground">
        {report.notes.map((n) => (
          <p key={n}>{n}</p>
        ))}
        <p>Money amounts are shown in each row&apos;s own currency; currencies are never combined.</p>
      </footer>
    </div>
  );
}

export default function ReportPrintPage(props: PageProps<"/report-print">) {
  return (
    <main className="min-h-screen bg-background">
      <Suspense fallback={<p className="p-6 text-sm text-muted-foreground">Building report…</p>}>
        <PrintableReport searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}
