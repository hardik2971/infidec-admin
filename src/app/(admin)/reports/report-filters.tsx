"use client";

import { Play } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { REPORT_INFO, REPORT_TYPES, reportQuery, type ReportFilters, type ReportType } from "@/lib/reports/schema";

const ALL = "__all__";

export function ReportFilterForm({
  filters,
  products,
  marketplaces,
}: {
  filters: ReportFilters;
  products: { id: string; name: string }[];
  marketplaces: { id: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [f, setF] = useState(filters);
  const info = REPORT_INFO[f.type];
  const set = (patch: Partial<ReportFilters>) => setF((prev) => ({ ...prev, ...patch }));

  return (
    <form
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[14rem_9.5rem_9.5rem_12rem_12rem_auto] lg:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(() => router.push(`${pathname}?${reportQuery(f)}`, { scroll: false }));
      }}
    >
      <Field>
        <FieldLabel htmlFor="r-type">Report</FieldLabel>
        <Select value={f.type} onValueChange={(v) => set({ type: v as ReportType })}>
          <SelectTrigger id="r-type" className="w-full bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {REPORT_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {REPORT_INFO[t].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel htmlFor="r-from">From</FieldLabel>
        <Input id="r-from" type="date" value={f.from} max={f.to} disabled={!info.dated} onChange={(e) => e.target.value && set({ from: e.target.value })} className="bg-card" />
      </Field>
      <Field>
        <FieldLabel htmlFor="r-to">To</FieldLabel>
        <Input id="r-to" type="date" value={f.to} min={f.from} disabled={!info.dated} onChange={(e) => e.target.value && set({ to: e.target.value })} className="bg-card" />
      </Field>
      <Field>
        <FieldLabel htmlFor="r-product">Product</FieldLabel>
        <Select value={f.productId ?? ALL} onValueChange={(v) => set({ productId: v === ALL ? undefined : v })}>
          <SelectTrigger id="r-product" className="w-full bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All products</SelectItem>
            {products.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel htmlFor="r-market">Marketplace</FieldLabel>
        <Select value={f.marketplace ?? ALL} disabled={!info.marketplaceFilter} onValueChange={(v) => set({ marketplace: v === ALL ? undefined : v })}>
          <SelectTrigger id="r-market" className="w-full bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All marketplaces</SelectItem>
            {marketplaces.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? <Spinner /> : <Play />} Run report
      </Button>
    </form>
  );
}
