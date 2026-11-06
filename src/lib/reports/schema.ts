/** Report catalogue — shared by the server builder, the reports page and the export routes. */

export const REPORT_TYPES = [
  "product_sales",
  "marketplace_sales",
  "direct_sales",
  "revenue",
  "customers",
  "licenses",
  "downloads",
  "refunds",
  "support_tickets",
  "version_adoption",
  "storage_usage",
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const REPORT_INFO: Record<ReportType, { label: string; description: string; dated: boolean; marketplaceFilter: boolean }> = {
  product_sales: { label: "Product sales", description: "Settled orders and earnings per product and currency.", dated: true, marketplaceFilter: true },
  marketplace_sales: { label: "Marketplace sales", description: "Every marketplace order with its verification state.", dated: true, marketplaceFilter: true },
  direct_sales: { label: "Direct website sales", description: "Orders taken on the INFIDEC website, including those awaiting payment checks.", dated: true, marketplaceFilter: false },
  revenue: { label: "Revenue", description: "Monthly marketplace earnings, direct revenue and refunds per currency.", dated: true, marketplaceFilter: true },
  customers: { label: "Customers", description: "Customers added in the period with their order counts.", dated: true, marketplaceFilter: false },
  licenses: { label: "Licenses", description: "Licenses by purchase date with support and verification status.", dated: true, marketplaceFilter: true },
  downloads: { label: "Downloads", description: "Download links issued or denied.", dated: true, marketplaceFilter: false },
  refunds: { label: "Refunds", description: "Refund requests and their outcomes.", dated: true, marketplaceFilter: true },
  support_tickets: { label: "Support tickets", description: "Tickets opened in the period.", dated: true, marketplaceFilter: false },
  version_adoption: { label: "Version adoption", description: "Downloads and unique customers per product version.", dated: true, marketplaceFilter: false },
  storage_usage: { label: "Storage usage", description: "Current storage used by packages, media and documentation per product.", dated: false, marketplaceFilter: false },
};

export type ColumnKind = "text" | "number" | "money" | "date" | "bytes";
export interface ReportColumn {
  key: string;
  label: string;
  kind: ColumnKind;
}

/** Money cells are minor units; the row's `currency` field names the currency. */
export type ReportRow = Record<string, string | number | null> & { currency?: string | null };

export interface ReportFilters {
  type: ReportType;
  from: string; // yyyy-MM-dd
  to: string;
  productId?: string;
  marketplace?: string;
}

export interface Report {
  filters: ReportFilters;
  title: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  notes: string[];
  generatedAt: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function parseReportFilters(sp: Record<string, string | string[] | undefined> | URLSearchParams): ReportFilters {
  const get = (k: string) => {
    const v = sp instanceof URLSearchParams ? sp.get(k) : sp[k];
    return typeof v === "string" ? v : undefined;
  };
  const type = (REPORT_TYPES as readonly string[]).includes(get("type") ?? "") ? (get("type") as ReportType) : "product_sales";
  const to = DATE_RE.test(get("to") ?? "") ? get("to")! : today();
  const defFrom = new Date(`${to}T00:00:00Z`);
  defFrom.setUTCDate(defFrom.getUTCDate() - 29);
  let from = DATE_RE.test(get("from") ?? "") ? get("from")! : defFrom.toISOString().slice(0, 10);
  if (from > to) from = to;
  const product = get("product");
  const marketplace = get("marketplace");
  return {
    type,
    from,
    to,
    productId: product && ID_RE.test(product) ? product : undefined,
    marketplace: marketplace && /^[a-z0-9_-]{1,40}$/.test(marketplace) ? marketplace : undefined,
  };
}

export function reportQuery(f: ReportFilters) {
  const p = new URLSearchParams({ type: f.type, from: f.from, to: f.to });
  if (f.productId) p.set("product", f.productId);
  if (f.marketplace) p.set("marketplace", f.marketplace);
  return p.toString();
}

const csvCell = (v: unknown) => {
  let s = v == null ? "" : String(v);
  // Neutralise spreadsheet formulas (CSV injection).
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

/** CSV with money in major units (two decimals) and ISO dates. */
export function toCsv(report: Report) {
  const header = report.columns.map((c) => csvCell(c.kind === "money" ? `${c.label} (major units)` : c.label));
  const lines = report.rows.map((r) =>
    report.columns
      .map((c) => {
        const v = r[c.key];
        if (v == null) return "";
        if (c.kind === "money") return csvCell((Number(v) / 100).toFixed(2));
        return csvCell(v);
      })
      .join(","),
  );
  return `﻿${[header.join(","), ...lines].join("\r\n")}\r\n`;
}
