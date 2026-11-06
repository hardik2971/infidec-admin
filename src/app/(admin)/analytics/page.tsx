import { CheckCircle2, Download, KeyRound, LifeBuoy, Mail, Receipt, RotateCcw, ShoppingBag, TrendingUp, Users } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAnalytics } from "@/lib/analytics/data";
import { requirePermission } from "@/lib/auth/session";
import { getProductOptions } from "@/lib/dashboard/data";
import { parseFilters } from "@/lib/dashboard/range";
import { formatMoney, formatNumber } from "@/lib/format";
import { ChartEmpty, CountBarChart, DonutChart, HorizontalBarChart, RevenueTrendChart } from "../dashboard/charts";
import { FilterBar } from "../dashboard/filter-bar";

export const metadata: Metadata = { title: "Analytics" };

function Panel({ title, description, children, className }: { title: string; description?: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-[15px]">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

async function Analytics({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePermission("analytics:view");
  const filters = parseFilters(await searchParams);
  const [a, products] = await Promise.all([getAnalytics(filters), getProductOptions().catch(() => [])]);
  const cur = a.baseCurrency;
  const bucket = a.range.bucket;
  const scope = filters.productId ? (products.find((p) => p.id === filters.productId)?.name ?? "Product") : "All products";
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{scope}</span> · {a.range.label}
          {a.truncated && " · showing the first 20,000 records of a type"}
        </p>
        <FilterBar filters={filters} products={products} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Revenue earned" value={formatMoney(a.sales.baseEarned, cur)} hint={`${formatMoney(a.sales.baseGross, cur)} gross · ${cur} only`} icon={TrendingUp} />
        <StatCard label="Settled orders" value={formatNumber(a.sales.settledCount)} hint={`Average ${formatMoney(a.sales.averageOrder, cur)}`} icon={ShoppingBag} />
        <StatCard label="Awaiting payment" value={formatNumber(a.sales.pending)} hint="Pending orders in range" icon={Receipt} tone={a.sales.pending ? "warning" : "default"} />
        <StatCard label="Refund rate" value={pct(a.refunds.rate)} hint={`${a.refunds.completed} completed of ${a.refunds.requested} requested`} icon={RotateCcw} />
        <StatCard label="New customers" value={formatNumber(a.customers.added)} icon={Users} />
        <StatCard label="Downloads" value={formatNumber(a.downloads.authorized)} hint={`${a.downloads.denied} denied`} icon={Download} />
        <StatCard label="Envato verifications" value={formatNumber(a.verifications.total)} hint={`${a.verifications.valid} valid`} icon={KeyRound} />
        <StatCard label="Emails" value={formatNumber(a.email.sent)} hint={`${a.email.failed} failed · ${a.email.skipped} skipped`} icon={Mail} tone={a.email.failed ? "warning" : "default"} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Revenue" description={`Settled ${cur} orders. Revenue = marketplace author earnings + direct sales.`} className="xl:col-span-2">
          <RevenueTrendChart data={a.sales.trend} bucket={bucket} currency={cur} />
        </Panel>
        <Panel title="By currency" description="Currencies are never combined.">
          {a.sales.byCurrency.length === 0 ? (
            <ChartEmpty message="No settled sales in this period." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Currency</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead className="text-right">Earned</TableHead>
                  <TableHead className="text-right">Refunded</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {a.sales.byCurrency.map((c) => (
                  <TableRow key={c.currency}>
                    <TableCell className="font-medium">{c.currency}</TableCell>
                    <TableCell className="text-right tabular">{c.orders}</TableCell>
                    <TableCell className="text-right tabular">{formatMoney(c.earned, c.currency)}</TableCell>
                    <TableCell className="text-right tabular">{formatMoney(c.refunded, c.currency)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Top products" description={`By ${cur} revenue earned.`}>
          <HorizontalBarChart data={a.sales.products.slice(0, 8)} currency={cur} empty="No product sales in this period." />
        </Panel>
        <Panel title="Sales channels" description="Marketplaces and the INFIDEC website.">
          <HorizontalBarChart data={a.sales.marketplaces} currency={cur} empty="No channel data in this period." />
        </Panel>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Panel title="Order status" description="All orders in the period.">
          <DonutChart data={a.sales.statuses} centerLabel="Orders" empty="No orders in this period." />
        </Panel>
        <Panel title="License types" description="Settled orders.">
          <DonutChart data={a.sales.licenseTypes} centerLabel="Licenses" empty="No licenses sold in this period." />
        </Panel>
        <Panel title="Order sources" description="Where settled orders came from.">
          <DonutChart data={a.sales.sources} centerLabel="Orders" empty="No settled orders yet." />
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Downloads" description="Authorized download links issued.">
          <CountBarChart data={a.downloads.trend} dataKey="downloads" label="Downloads" color="var(--chart-2)" bucket={bucket} empty="No downloads in this period." />
        </Panel>
        <Panel title="Version adoption" description="Downloads per product version.">
          {a.downloads.versions.length === 0 ? (
            <ChartEmpty message="No version downloads yet." />
          ) : (
            <ul className="space-y-2 text-sm">
              {a.downloads.versions.map((v) => (
                <li key={v.name} className="flex items-center justify-between gap-3">
                  <span className="truncate">{v.name}</span>
                  <span className="font-mono tabular text-muted-foreground">{v.value}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="License verifications" description="Envato purchase-code checks.">
          <DonutChart data={a.verifications.results} centerLabel="Checks" empty="No verifications in this period." />
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="New customers">
          <CountBarChart data={a.customers.trend} dataKey="customers" label="Customers" color="var(--chart-1)" bucket={bucket} empty="No new customers in this period." />
        </Panel>
        <Panel title="Support tickets" description={`${a.support.total} created in this period.`}>
          <CountBarChart data={a.support.trend} dataKey="tickets" label="Tickets" color="var(--chart-4)" bucket={bucket} empty="No tickets in this period." />
        </Panel>
        <Panel title="Ticket status">
          <DonutChart data={a.support.statuses} centerLabel="Tickets" empty="No tickets in this period." />
        </Panel>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Panel title="Refund requests">
          <DonutChart data={a.refunds.statuses} centerLabel="Refunds" empty="No refund requests in this period." />
        </Panel>
        <Panel title="Customer sources">
          <DonutChart data={a.customers.sources} centerLabel="Customers" empty="No new customers in this period." />
        </Panel>
        <Panel title="Ticket categories">
          {a.support.categories.length === 0 ? (
            <ChartEmpty message="No tickets in this period." />
          ) : (
            <ul className="space-y-2 text-sm">
              {a.support.categories.map((c) => (
                <li key={c.name} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 truncate">
                    <LifeBuoy className="size-3.5 text-muted-foreground" /> {c.name}
                  </span>
                  <span className="font-mono tabular text-muted-foreground">{c.value}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {a.sales.otherCurrency > 0 && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <CheckCircle2 className="size-3.5" /> {a.sales.otherCurrency} settled order(s) in other currencies are counted in the currency table but not in {cur} charts.
        </p>
      )}
    </div>
  );
}

export default function AnalyticsPage(props: PageProps<"/analytics">) {
  return (
    <>
      <PageHeader title="Analytics" description="Sales, licenses, downloads, support and email performance — computed from recorded data only." />
      <Suspense fallback={<Skeleton className="h-[40rem] w-full rounded-xl" />}>
        <Analytics searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}
