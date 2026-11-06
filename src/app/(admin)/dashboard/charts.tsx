"use client";

import { format, parseISO } from "date-fns";
import { BarChart3 } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Label, Pie, PieChart, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatMoney, formatNumber } from "@/lib/format";

type Bucket = "day" | "month";

function bucketLabel(bucket: Bucket) {
  return (value: string) =>
    bucket === "day" ? format(parseISO(value), "d MMM") : format(parseISO(`${value}-01`), "MMM yy");
}

export function ChartEmpty({ message, className = "h-64" }: { message: string; className?: string }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-center ${className}`}>
      <span className="inline-flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <BarChart3 className="size-4" />
      </span>
      <p className="max-w-56 text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

const revenueConfig = {
  revenue: { label: "Revenue earned", color: "var(--chart-1)" },
  gross: { label: "Gross sales", color: "var(--chart-2)" },
} satisfies ChartConfig;

export function RevenueTrendChart({
  data,
  bucket,
  currency,
}: {
  data: { bucket: string; gross: number; revenue: number }[];
  bucket: Bucket;
  currency: string;
}) {
  if (!data.some((d) => d.gross > 0 || d.revenue > 0)) {
    return <ChartEmpty message="No settled sales in this period yet." className="h-[260px]" />;
  }
  return (
    <ChartContainer config={revenueConfig} className="h-[260px] w-full">
      <AreaChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
        <defs>
          <linearGradient id="fill-revenue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-revenue)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--color-revenue)" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="fill-gross" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-gross)" stopOpacity={0.2} />
            <stop offset="100%" stopColor="var(--color-gross)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="bucket" tickLine={false} axisLine={false} tickMargin={8} minTickGap={28} tickFormatter={bucketLabel(bucket)} />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={56}
          tickFormatter={(v: number) => formatMoney(v, currency, { compact: true })}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(v) => bucketLabel(bucket)(String(v))}
              formatter={(value, name) => (
                <div className="flex w-full justify-between gap-6">
                  <span className="text-muted-foreground">{revenueConfig[name as keyof typeof revenueConfig]?.label}</span>
                  <span className="font-mono font-medium tabular">{formatMoney(Number(value), currency)}</span>
                </div>
              )}
            />
          }
        />
        <Area dataKey="gross" type="monotone" stroke="var(--color-gross)" fill="url(#fill-gross)" strokeWidth={1.5} strokeDasharray="4 3" />
        <Area dataKey="revenue" type="monotone" stroke="var(--color-revenue)" fill="url(#fill-revenue)" strokeWidth={2} />
        <ChartLegend content={<ChartLegendContent />} />
      </AreaChart>
    </ChartContainer>
  );
}

export function CountBarChart({
  data,
  dataKey,
  label,
  color,
  bucket,
  empty,
}: {
  data: Record<string, string | number>[];
  dataKey: string;
  label: string;
  color: string;
  bucket: Bucket;
  empty: string;
}) {
  if (!data.some((d) => Number(d[dataKey]) > 0)) return <ChartEmpty message={empty} />;
  const config = { [dataKey]: { label, color } } satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="h-64 w-full">
      <BarChart data={data} margin={{ left: -12, right: 4, top: 8 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="bucket" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} tickFormatter={bucketLabel(bucket)} />
        <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={40} />
        <ChartTooltip cursor={{ fill: "var(--muted)" }} content={<ChartTooltipContent labelFormatter={(v) => bucketLabel(bucket)(String(v))} />} />
        <Bar dataKey={dataKey} fill={`var(--color-${dataKey})`} radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ChartContainer>
  );
}

export function ActivityAreaChart({
  data,
  dataKey,
  label,
  color,
  bucket,
  empty,
}: {
  data: Record<string, string | number>[];
  dataKey: string;
  label: string;
  color: string;
  bucket: Bucket;
  empty: string;
}) {
  if (!data.some((d) => Number(d[dataKey]) > 0)) return <ChartEmpty message={empty} />;
  const config = { [dataKey]: { label, color } } satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="h-64 w-full">
      <AreaChart data={data} margin={{ left: -12, right: 4, top: 8 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="bucket" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} tickFormatter={bucketLabel(bucket)} />
        <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={40} />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(v) => bucketLabel(bucket)(String(v))} />} />
        <Area dataKey={dataKey} type="monotone" stroke={`var(--color-${dataKey})`} fill={`var(--color-${dataKey})`} fillOpacity={0.15} strokeWidth={2} />
      </AreaChart>
    </ChartContainer>
  );
}

export function HorizontalBarChart({
  data,
  currency,
  empty,
}: {
  data: { name: string; sales: number; revenue: number }[];
  currency: string;
  empty: string;
}) {
  if (data.length === 0) return <ChartEmpty message={empty} />;
  const config = { sales: { label: "Sales", color: "var(--chart-1)" } } satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="h-64 w-full">
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
        <CartesianGrid horizontal={false} strokeDasharray="3 3" />
        <XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false} />
        <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={104} />
        <ChartTooltip
          cursor={{ fill: "var(--muted)" }}
          content={
            <ChartTooltipContent
              formatter={(value, _name, item) => (
                <div className="flex w-full flex-col gap-0.5">
                  <span className="font-mono font-medium tabular">{formatNumber(Number(value))} sales</span>
                  <span className="text-muted-foreground">{formatMoney(item.payload.revenue, currency)} earned</span>
                </div>
              )}
            />
          }
        />
        <Bar dataKey="sales" fill="var(--color-sales)" radius={[0, 4, 4, 0]} maxBarSize={22} />
      </BarChart>
    </ChartContainer>
  );
}

const DONUT_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

export function DonutChart({
  data,
  centerLabel,
  empty,
}: {
  data: { name: string; value: number }[];
  centerLabel: string;
  empty: string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <ChartEmpty message={empty} />;
  const config: ChartConfig = Object.fromEntries(
    data.map((d, i) => [d.name, { label: d.name, color: DONUT_COLORS[i % DONUT_COLORS.length] }]),
  );
  return (
    <ChartContainer config={config} className="mx-auto h-64 w-full">
      <PieChart>
        <ChartTooltip content={<ChartTooltipContent nameKey="name" hideLabel />} />
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={62} outerRadius={92} paddingAngle={2} strokeWidth={0}>
          {data.map((d, i) => (
            <Cell key={d.name} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
          ))}
          <Label
            content={({ viewBox }) => {
              if (!viewBox || !("cx" in viewBox)) return null;
              return (
                <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                  <tspan x={viewBox.cx} y={viewBox.cy} className="fill-foreground text-2xl font-semibold">
                    {formatNumber(total)}
                  </tspan>
                  <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) + 20} className="fill-muted-foreground text-xs">
                    {centerLabel}
                  </tspan>
                </text>
              );
            }}
          />
        </Pie>
        <ChartLegend content={<ChartLegendContent nameKey="name" />} />
      </PieChart>
    </ChartContainer>
  );
}
