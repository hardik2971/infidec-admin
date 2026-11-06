import {
  Boxes,
  CheckCircle2,
  Clock,
  Download,
  FilePen,
  HardDrive,
  Info,
  KeyRound,
  LifeBuoy,
  Package,
  ShoppingBag,
  Store,
  Users,
} from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePermission } from "@/lib/auth/session";
import { getDashboardData, getProductOptions, type Section } from "@/lib/dashboard/data";
import { parseFilters } from "@/lib/dashboard/range";
import { formatBytes, formatMoney, formatNumber } from "@/lib/format";
import { ActivityAreaChart, ChartEmpty, CountBarChart, DonutChart, HorizontalBarChart, RevenueTrendChart } from "./charts";
import { FilterBar } from "./filter-bar";

export const metadata: Metadata = { title: "Overview" };

function val<T, R>(s: Section<T>, pick: (d: T) => R): R | undefined {
  return s.ok ? pick(s.data) : undefined;
}
function err(s: Section<unknown>) {
  return s.ok ? undefined : s.error;
}

function ChartCard({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
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

async function Dashboard({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePermission("dashboard:view");
  const filters = parseFilters(await searchParams);
  const [data, products] = await Promise.all([getDashboardData(filters), getProductOptions().catch(() => [])]);
  const { catalogue, sales, customers, licenses, downloads, packages, support, baseCurrency: cur, bucket } = data;
  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? id;
  const money = (n: number | undefined) => (n === undefined ? "—" : formatMoney(n, cur));
  const scopeNote = filters.productId ? productName(filters.productId) : "All products";

  const productSales = sales.ok
    ? sales.data.byProduct
        .map((p) => ({ name: productName(p.productId), ...p }))
        .sort((a, b) => b.sales - a.sales)
        .slice(0, 8)
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{scopeNote}</span> · {data.range.label}
        </p>
        <FilterBar filters={filters} products={products} />
      </div>

      {/* Revenue — gross, marketplace earnings and direct revenue are always shown separately. */}
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="gap-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <CardDescription>Total revenue earned</CardDescription>
                <p className="mt-1 text-3xl font-semibold tracking-tight tabular">
                  {sales.ok ? money(sales.data.totalRevenue) : "—"}
                </p>
              </div>
              <div className="flex items-start gap-1.5 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                <Info className="mt-0.5 size-3.5 shrink-0" />
                <span>Revenue = marketplace author earnings + direct website sales. Gross marketplace sales include marketplace fees.</span>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                { label: "Gross sales", value: val(sales, (d) => d.grossSales), dot: "bg-chart-2" },
                { label: "Marketplace author earnings", value: val(sales, (d) => d.marketplaceEarnings), dot: "bg-chart-1" },
                { label: "Direct website revenue", value: val(sales, (d) => d.directRevenue), dot: "bg-chart-3" },
              ].map((m) => (
                <div key={m.label} className="rounded-lg border px-3 py-2.5">
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className={`size-2 rounded-full ${m.dot}`} /> {m.label}
                  </p>
                  <p className="mt-1 font-semibold tabular">{money(m.value)}</p>
                </div>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            {sales.ok ? (
              <RevenueTrendChart data={sales.data.trend} bucket={bucket} currency={cur} />
            ) : (
              <ChartEmpty message={sales.error} className="h-[260px]" />
            )}
            {sales.ok && (sales.data.otherCurrencyOrders > 0 || sales.data.truncated) && (
              <p className="mt-3 text-xs text-muted-foreground">
                {sales.data.otherCurrencyOrders > 0 &&
                  `${sales.data.otherCurrencyOrders} order(s) in other currencies are excluded from ${cur} totals. `}
                {sales.data.truncated && "Large range: totals are based on the first 10,000 orders."}
              </p>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <StatCard
            label="Marketplace sales"
            icon={Store}
            tone="primary"
            value={formatNumber(val(sales, (d) => d.marketplaceSales) ?? 0)}
            hint="CodeCanyon & other marketplaces"
            error={err(sales)}
          />
          <StatCard
            label="Direct website sales"
            icon={ShoppingBag}
            tone="violet"
            value={formatNumber(val(sales, (d) => d.directSales) ?? 0)}
            hint="Purchases on infidec.com"
            error={err(sales)}
          />
          <StatCard
            label="Pending orders"
            icon={Clock}
            tone="warning"
            value={formatNumber(val(sales, (d) => d.pendingOrders) ?? 0)}
            hint="Awaiting payment or verification"
            error={err(sales)}
            className="sm:col-span-2 xl:col-span-1"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Total products" icon={Boxes} tone="primary" value={formatNumber(val(catalogue, (d) => d.total) ?? 0)} hint="Across the catalogue" error={err(catalogue)} />
        <StatCard label="Published products" icon={CheckCircle2} tone="success" value={formatNumber(val(catalogue, (d) => d.published) ?? 0)} error={err(catalogue)} />
        <StatCard label="Draft products" icon={FilePen} value={formatNumber(val(catalogue, (d) => d.draft) ?? 0)} error={err(catalogue)} />
        <StatCard
          label="Total customers"
          icon={Users}
          tone="cyan"
          value={formatNumber(val(customers, (d) => d.total) ?? 0)}
          hint={customers.ok ? `${formatNumber(customers.data.newInRange)} new in period` : undefined}
          error={err(customers)}
        />
        <StatCard label="Active licenses" icon={KeyRound} tone="violet" value={formatNumber(val(licenses, (d) => d.active) ?? 0)} error={err(licenses)} />
        <StatCard
          label="Total downloads"
          icon={Download}
          tone="cyan"
          value={formatNumber(val(downloads, (d) => d.total) ?? 0)}
          hint={downloads.ok ? `${formatNumber(downloads.data.inRange)} in period` : undefined}
          error={err(downloads)}
        />
        <StatCard label="Source packages" icon={Package} tone="primary" value={formatNumber(val(packages, (d) => d.total) ?? 0)} hint="Active ZIP packages" error={err(packages)} />
        <StatCard label="Storage usage" icon={HardDrive} value={formatBytes(val(packages, (d) => d.storageBytes) ?? 0)} hint="Source packages in Storage" error={err(packages)} />
        <StatCard label="Open support tickets" icon={LifeBuoy} tone="warning" value={formatNumber(val(support, (d) => d.open) ?? 0)} error={err(support)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Sales volume" description="Settled orders per period">
          {sales.ok ? (
            <CountBarChart data={sales.data.trend} dataKey="sales" label="Sales" color="var(--chart-1)" bucket={bucket} empty="No sales recorded in this period." />
          ) : (
            <ChartEmpty message={sales.error} />
          )}
        </ChartCard>
        <ChartCard title="Product-wise sales" description="Top products by settled orders">
          {sales.ok ? (
            <HorizontalBarChart data={productSales} currency={cur} empty="No product sales in this period." />
          ) : (
            <ChartEmpty message={sales.error} />
          )}
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Sales by channel" description="Marketplaces vs. direct website">
          {sales.ok ? (
            <DonutChart
              data={sales.data.byMarketplace.map((m) => ({ name: m.name, value: m.sales }))}
              centerLabel="sales"
              empty="No channel data in this period."
            />
          ) : (
            <ChartEmpty message={sales.error} />
          )}
        </ChartCard>
        <ChartCard title="License distribution" description="All licenses by type">
          {licenses.ok ? (
            <DonutChart
              data={licenses.data.distribution.map((l) => ({ name: l.label, value: l.count }))}
              centerLabel="licenses"
              empty="No licenses recorded yet."
            />
          ) : (
            <ChartEmpty message={licenses.error} />
          )}
        </ChartCard>
        <ChartCard title="Download activity" description="Authorised downloads">
          {downloads.ok ? (
            <ActivityAreaChart data={downloads.data.activity} dataKey="downloads" label="Downloads" color="var(--chart-2)" bucket={bucket} empty="No downloads in this period." />
          ) : (
            <ChartEmpty message={downloads.error} />
          )}
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <ChartCard title="Customer acquisition" description="New customers per period" className="lg:col-span-2">
          {customers.ok ? (
            <CountBarChart data={customers.data.acquisition} dataKey="customers" label="New customers" color="var(--chart-3)" bucket={bucket} empty="No new customers in this period." />
          ) : (
            <ChartEmpty message={customers.error} />
          )}
        </ChartCard>
        <ChartCard title="Product performance" description="Settled sales and revenue earned in this period" className="lg:col-span-3">
          {!sales.ok ? (
            <ChartEmpty message={sales.error} />
          ) : productSales.length === 0 ? (
            <ChartEmpty message="Product performance appears once orders are recorded." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Sales</TableHead>
                  <TableHead className="text-right">Revenue earned</TableHead>
                  <TableHead className="text-right">Share</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {productSales.map((p) => (
                  <TableRow key={p.productId}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-right tabular">{formatNumber(p.sales)}</TableCell>
                    <TableCell className="text-right tabular">{money(p.revenue)}</TableCell>
                    <TableCell className="text-right text-muted-foreground tabular">
                      {sales.data.totalRevenue ? `${((p.revenue / sales.data.totalRevenue) * 100).toFixed(1)}%` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </ChartCard>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-8 w-96" />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Skeleton className="h-[420px] rounded-xl xl:col-span-2" />
        <div className="grid gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export default function DashboardPage(props: PageProps<"/dashboard">) {
  return (
    <>
      <PageHeader title="Overview" description="Live performance across every INFIDEC product. Figures come only from recorded data — nothing is estimated." />
      <Suspense fallback={<DashboardSkeleton />}>
        <Dashboard searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}
