import { FileDown, Printer } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { ReportTable } from "@/components/reports/report-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { requirePermission } from "@/lib/auth/session";
import { getProductOptions } from "@/lib/dashboard/data";
import { formatNumber } from "@/lib/format";
import { listMarketplaceOptions } from "@/lib/products/service";
import { hasPermission } from "@/lib/rbac/permissions";
import { buildReport } from "@/lib/reports/build";
import { REPORT_INFO, parseReportFilters, reportQuery } from "@/lib/reports/schema";
import { ReportFilterForm } from "./report-filters";

export const metadata: Metadata = { title: "Reports" };

const PREVIEW_ROWS = 300;

async function Reports({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePermission("reports:view");
  const filters = parseReportFilters(await searchParams);
  const [report, products, marketplaces] = await Promise.all([
    buildReport(filters),
    getProductOptions().catch(() => []),
    listMarketplaceOptions().catch(() => []),
  ]);
  const canExport = hasPermission(session.permissions, "reports:export");
  const info = REPORT_INFO[filters.type];
  const qs = reportQuery(filters);

  return (
    <div className="space-y-6">
      <ReportFilterForm key={qs} filters={filters} products={products} marketplaces={marketplaces} />
      <Card>
        <CardHeader className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-[15px]">{report.title}</CardTitle>
            <CardDescription>
              {info.description} {info.dated ? `${filters.from} to ${filters.to}.` : ""} {formatNumber(report.rows.length)} row(s).
            </CardDescription>
          </div>
          {canExport && report.rows.length > 0 && (
            <div className="flex gap-2">
              <Button asChild variant="outline" size="sm">
                <a href={`/api/reports?${qs}`} download>
                  <FileDown /> CSV
                </a>
              </Button>
              <Button asChild variant="outline" size="sm">
                <a href={`/report-print?${qs}`} target="_blank" rel="noreferrer">
                  <Printer /> PDF / Print
                </a>
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {report.rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No records match these filters.</p>
          ) : (
            <>
              <ReportTable report={report} limit={PREVIEW_ROWS} />
              {report.rows.length > PREVIEW_ROWS && <p className="text-xs text-muted-foreground">Showing the first {PREVIEW_ROWS} rows. Export to see everything.</p>}
            </>
          )}
          {report.notes.map((n) => (
            <p key={n} className="text-xs text-muted-foreground">
              {n}
            </p>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export default function ReportsPage(props: PageProps<"/reports">) {
  return (
    <>
      <PageHeader title="Reports" description="Filter by product, marketplace and date, then export as CSV or PDF. Only recorded figures are shown — nothing is estimated." />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <Reports searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}
