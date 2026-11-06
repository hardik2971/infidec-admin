import { endOfDay, startOfDay, startOfYear, subDays } from "date-fns";

export const RANGE_KEYS = ["today", "7d", "30d", "90d", "ytd", "custom"] as const;
export type RangeKey = (typeof RANGE_KEYS)[number];

export const RANGE_LABELS: Record<RangeKey, string> = {
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  ytd: "This year",
  custom: "Custom range",
};

export interface DashboardFilters {
  range: RangeKey;
  from?: string; // yyyy-MM-dd, custom only
  to?: string;
  productId?: string;
}

export interface ResolvedRange {
  start: Date;
  end: Date;
  bucket: "day" | "month";
  label: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseFilters(sp: Record<string, string | string[] | undefined>): DashboardFilters {
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const range = (RANGE_KEYS as readonly string[]).includes(one("range") ?? "") ? (one("range") as RangeKey) : "30d";
  const from = one("from");
  const to = one("to");
  const product = one("product");
  return {
    range,
    from: from && DATE_RE.test(from) ? from : undefined,
    to: to && DATE_RE.test(to) ? to : undefined,
    // Product IDs are Firestore document IDs; reject anything else outright.
    productId: product && /^[A-Za-z0-9_-]{1,128}$/.test(product) ? product : undefined,
  };
}

export function resolveRange(filters: DashboardFilters, now: Date = new Date()): ResolvedRange {
  let start: Date;
  let end = endOfDay(now);
  switch (filters.range) {
    case "today":
      start = startOfDay(now);
      break;
    case "7d":
      start = startOfDay(subDays(now, 6));
      break;
    case "90d":
      start = startOfDay(subDays(now, 89));
      break;
    case "ytd":
      start = startOfYear(now);
      break;
    case "custom": {
      const from = filters.from ? new Date(`${filters.from}T00:00:00`) : subDays(now, 29);
      const to = filters.to ? new Date(`${filters.to}T00:00:00`) : now;
      start = startOfDay(from <= to ? from : to);
      end = endOfDay(from <= to ? to : from);
      break;
    }
    default:
      start = startOfDay(subDays(now, 29));
  }
  const days = (end.getTime() - start.getTime()) / 86_400_000;
  return { start, end, bucket: days > 120 ? "month" : "day", label: RANGE_LABELS[filters.range] };
}
