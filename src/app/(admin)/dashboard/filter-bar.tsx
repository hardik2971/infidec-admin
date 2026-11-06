"use client";

import { format } from "date-fns";
import { CalendarDays, Package } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { RANGE_KEYS, RANGE_LABELS, type DashboardFilters } from "@/lib/dashboard/range";
import type { ProductOption } from "@/lib/dashboard/data";

const ALL = "__all__";

export function FilterBar({ filters, products }: { filters: DashboardFilters; products: ProductOption[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [customOpen, setCustomOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>(
    filters.from ? { from: new Date(`${filters.from}T00:00:00`), to: filters.to ? new Date(`${filters.to}T00:00:00`) : undefined } : undefined,
  );

  function apply(next: Partial<DashboardFilters>) {
    const merged = { ...filters, ...next };
    const params = new URLSearchParams();
    if (merged.range !== "30d") params.set("range", merged.range);
    if (merged.range === "custom" && merged.from) params.set("from", merged.from);
    if (merged.range === "custom" && merged.to) params.set("to", merged.to);
    if (merged.productId) params.set("product", merged.productId);
    const qs = params.toString();
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  const customLabel =
    filters.range === "custom" && filters.from
      ? `${format(new Date(`${filters.from}T00:00:00`), "d MMM yyyy")} – ${format(new Date(`${(filters.to ?? filters.from)}T00:00:00`), "d MMM yyyy")}`
      : "Custom range";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {pending && <Spinner className="text-muted-foreground" />}

      <Select value={filters.productId ?? ALL} onValueChange={(v) => apply({ productId: v === ALL ? undefined : v })}>
        <SelectTrigger className="w-48 bg-card" aria-label="Product filter">
          <Package className="size-4 text-muted-foreground" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          <SelectItem value={ALL}>All products</SelectItem>
          {products.length > 0 && <SelectSeparator />}
          {products.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center rounded-lg border bg-card p-0.5 shadow-xs" role="group" aria-label="Date range">
        {RANGE_KEYS.filter((k) => k !== "custom").map((key) => (
          <Button
            key={key}
            size="sm"
            variant={filters.range === key ? "secondary" : "ghost"}
            className={`h-7 px-2.5 text-xs ${filters.range === key ? "shadow-xs" : "text-muted-foreground"}`}
            onClick={() => apply({ range: key, from: undefined, to: undefined })}
            aria-pressed={filters.range === key}
          >
            {key === "today" ? "Today" : key === "ytd" ? "Year" : key.toUpperCase()}
          </Button>
        ))}
        <Popover open={customOpen} onOpenChange={setCustomOpen}>
          <PopoverTrigger asChild>
            <Button
              size="sm"
              variant={filters.range === "custom" ? "secondary" : "ghost"}
              className={`h-7 px-2.5 text-xs ${filters.range === "custom" ? "shadow-xs" : "text-muted-foreground"}`}
              aria-label={RANGE_LABELS.custom}
            >
              <CalendarDays className="size-3.5" />
              <span className="hidden sm:inline">{customLabel}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-auto p-0">
            <Calendar
              mode="range"
              numberOfMonths={2}
              selected={draft}
              onSelect={setDraft}
              disabled={{ after: new Date() }}
              defaultMonth={draft?.from}
            />
            <div className="flex justify-end gap-2 border-t p-3">
              <Button size="sm" variant="ghost" onClick={() => setCustomOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!draft?.from}
                onClick={() => {
                  setCustomOpen(false);
                  apply({
                    range: "custom",
                    from: format(draft!.from!, "yyyy-MM-dd"),
                    to: format(draft!.to ?? draft!.from!, "yyyy-MM-dd"),
                  });
                }}
              >
                Apply
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
