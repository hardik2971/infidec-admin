import "server-only";

import { eachDayOfInterval, eachMonthOfInterval, format } from "date-fns";
import { Timestamp, type DocumentData } from "firebase-admin/firestore";
import { resolveRange, type DashboardFilters } from "@/lib/dashboard/range";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { LICENSE_TYPE_LABELS, ORDER_STATUS_LABELS, marketplaceLabel, type LicenseType, type OrderStatus } from "@/lib/sales/schema";
import { TICKET_STATUS_LABELS, type TicketStatus } from "@/lib/support/schema";

/**
 * Analytics across the whole platform, computed from real records only.
 * Money stays in minor units and is never summed across currencies: per-currency
 * totals are reported side by side, and charts use the base currency.
 * Product filtering is done in memory so no composite indexes are needed.
 */

const MAX_SCAN = 20_000;
const SETTLED = new Set(["completed", "partially_refunded"]);

type Doc = DocumentData & { id: string };

async function inRange(collection: keyof typeof COLLECTIONS, field: string, start: Date, end: Date, fields: string[]): Promise<Doc[]> {
  const snap = await adminDb
    .collection(COLLECTIONS[collection])
    .where(field, ">=", Timestamp.fromDate(start))
    .where(field, "<=", Timestamp.fromDate(end))
    .select(...fields)
    .limit(MAX_SCAN)
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

const toDate = (v: unknown) => (v instanceof Timestamp ? v.toDate() : null);
const inc = <K>(m: Map<K, number>, k: K, by = 1) => m.set(k, (m.get(k) ?? 0) + by);
const sorted = (m: Map<string, number>, label: (k: string) => string = (k) => k) =>
  [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ name: label(k), value: v }));

export async function getAnalytics(filters: DashboardFilters) {
  const range = resolveRange(filters);
  const { productId } = filters;
  const keep = (d: Doc) => !productId || d.productId === productId;

  const [general, productSnap, orders, refunds, downloads, verifications, tickets, customers, emails] = await Promise.all([
    adminDb.collection(COLLECTIONS.systemSettings).doc("general").get(),
    adminDb.collection(COLLECTIONS.products).select("name").get(),
    inRange("orders", "purchaseDate", range.start, range.end, ["productId", "channel", "marketplace", "grossAmount", "authorEarnings", "currency", "status", "licenseType", "source", "verificationStatus", "purchaseDate"]),
    inRange("refunds", "createdAt", range.start, range.end, ["productId", "amount", "currency", "status", "createdAt"]),
    inRange("downloadLogs", "createdAt", range.start, range.end, ["productId", "version", "result", "reason", "createdAt"]),
    inRange("licenseVerifications", "createdAt", range.start, range.end, ["productId", "result", "createdAt"]),
    inRange("supportTickets", "createdAt", range.start, range.end, ["productId", "status", "category", "priority", "createdAt"]),
    inRange("customers", "createdAt", range.start, range.end, ["source", "createdAt"]),
    inRange("notifications", "createdAt", range.start, range.end, ["channel", "status", "template", "createdAt"]),
  ]);

  const baseCurrency = String(general.get("baseCurrency") ?? "INR");
  const productName = new Map(productSnap.docs.map((d) => [d.id, String(d.get("name") ?? d.id)]));
  const name = (id: string) => productName.get(id) ?? "Unknown product";

  const buckets =
    range.bucket === "day"
      ? eachDayOfInterval({ start: range.start, end: range.end }).map((d) => format(d, "yyyy-MM-dd"))
      : eachMonthOfInterval({ start: range.start, end: range.end }).map((d) => format(d, "yyyy-MM"));
  const bucketOf = (d: Date | null) => (d ? format(d, range.bucket === "day" ? "yyyy-MM-dd" : "yyyy-MM") : null);
  const series = <T extends Record<string, number>>(zero: () => T) => new Map(buckets.map((b) => [b, zero()]));

  // ----- sales -----
  const revenueTrend = series(() => ({ gross: 0, revenue: 0, orders: 0 }));
  const byCurrency = new Map<string, { currency: string; orders: number; gross: number; earned: number; refunded: number }>();
  const byProduct = new Map<string, { sales: number; revenue: number }>();
  const byMarketplace = new Map<string, { sales: number; revenue: number }>();
  const statuses = new Map<string, number>();
  const licenseTypes = new Map<string, number>();
  const sources = new Map<string, number>();
  let settledCount = 0;
  let otherCurrency = 0;

  for (const o of orders.filter(keep)) {
    inc(statuses, String(o.status));
    if (!SETTLED.has(o.status)) continue;
    settledCount++;
    const currency = String(o.currency ?? baseCurrency);
    const gross = Number(o.grossAmount ?? 0);
    const earned = o.channel === "marketplace" ? Number(o.authorEarnings ?? 0) : gross;
    const c = byCurrency.get(currency) ?? { currency, orders: 0, gross: 0, earned: 0, refunded: 0 };
    c.orders++;
    c.gross += gross;
    c.earned += earned;
    byCurrency.set(currency, c);
    inc(licenseTypes, String(o.licenseType ?? "regular"));
    inc(sources, o.source === "website" ? "Website import" : o.channel === "marketplace" ? (o.verificationStatus === "verified" ? "Envato verified" : "Marketplace") : "Manual direct");
    if (currency !== baseCurrency) {
      otherCurrency++;
      continue;
    }
    const b = bucketOf(toDate(o.purchaseDate));
    const t = b ? revenueTrend.get(b) : undefined;
    if (t) {
      t.gross += gross;
      t.revenue += earned;
      t.orders++;
    }
    const p = byProduct.get(o.productId) ?? { sales: 0, revenue: 0 };
    p.sales++;
    p.revenue += earned;
    byProduct.set(o.productId, p);
    const mk = o.channel === "direct" ? "INFIDEC Website (direct)" : marketplaceLabel(String(o.marketplace ?? ""));
    const m = byMarketplace.get(mk) ?? { sales: 0, revenue: 0 };
    m.sales++;
    m.revenue += earned;
    byMarketplace.set(mk, m);
  }

  // ----- refunds -----
  const refundStatuses = new Map<string, number>();
  let refundsCompleted = 0;
  for (const r of refunds.filter(keep)) {
    inc(refundStatuses, String(r.status));
    if (r.status !== "completed") continue;
    refundsCompleted++;
    const currency = String(r.currency ?? baseCurrency);
    const c = byCurrency.get(currency) ?? { currency, orders: 0, gross: 0, earned: 0, refunded: 0 };
    c.refunded += Number(r.amount ?? 0);
    byCurrency.set(currency, c);
  }

  // ----- downloads -----
  const downloadTrend = series(() => ({ downloads: 0 }));
  const versions = new Map<string, number>();
  const denials = new Map<string, number>();
  let authorized = 0;
  for (const d of downloads.filter(keep)) {
    if (d.result !== "authorized") {
      inc(denials, String(d.reason ?? "denied").replaceAll("_", " "));
      continue;
    }
    authorized++;
    inc(versions, `${name(d.productId)} v${d.version ?? "?"}`);
    const b = bucketOf(toDate(d.createdAt));
    const t = b ? downloadTrend.get(b) : undefined;
    if (t) t.downloads++;
  }

  // ----- verifications -----
  const verificationResults = new Map<string, number>();
  for (const v of verifications.filter((v) => !productId || !v.productId || v.productId === productId)) inc(verificationResults, String(v.result ?? "unknown"));

  // ----- support -----
  const ticketTrend = series(() => ({ tickets: 0 }));
  const ticketStatuses = new Map<string, number>();
  const ticketCategories = new Map<string, number>();
  for (const t of tickets.filter((t) => !productId || t.productId === productId)) {
    inc(ticketStatuses, String(t.status ?? "open"));
    inc(ticketCategories, String(t.category || "General"));
    const b = bucketOf(toDate(t.createdAt));
    const s = b ? ticketTrend.get(b) : undefined;
    if (s) s.tickets++;
  }

  // ----- customers -----
  const customerTrend = series(() => ({ customers: 0 }));
  const customerSources = new Map<string, number>();
  for (const c of customers) {
    inc(customerSources, c.source === "website" ? "Website" : c.source === "envato" ? "Envato" : "Manual");
    const b = bucketOf(toDate(c.createdAt));
    const s = b ? customerTrend.get(b) : undefined;
    if (s) s.customers++;
  }

  // ----- email -----
  const emailStatus = new Map<string, number>();
  for (const e of emails.filter((e) => e.channel === "email")) inc(emailStatus, String(e.status ?? "unknown"));

  const toRows = <T extends object>(m: Map<string, T>) => [...m.entries()].map(([bucket, v]) => ({ bucket, ...v }));
  const base = byCurrency.get(baseCurrency);

  return {
    range,
    baseCurrency,
    truncated: [orders, refunds, downloads, verifications, tickets, customers, emails].some((l) => l.length >= MAX_SCAN),
    sales: {
      settledCount,
      otherCurrency,
      baseGross: base?.gross ?? 0,
      baseEarned: base?.earned ?? 0,
      averageOrder: base && base.orders ? Math.round(base.gross / base.orders) : 0,
      byCurrency: [...byCurrency.values()].sort((a, b) => (a.currency === baseCurrency ? -1 : b.currency === baseCurrency ? 1 : a.currency.localeCompare(b.currency))),
      trend: toRows(revenueTrend),
      products: [...byProduct.entries()].map(([id, v]) => ({ name: name(id), ...v })).sort((a, b) => b.revenue - a.revenue),
      marketplaces: [...byMarketplace.entries()].map(([n, v]) => ({ name: n, ...v })).sort((a, b) => b.revenue - a.revenue),
      statuses: sorted(statuses, (k) => ORDER_STATUS_LABELS[k as OrderStatus] ?? k),
      licenseTypes: sorted(licenseTypes, (k) => LICENSE_TYPE_LABELS[k as LicenseType] ?? k),
      sources: sorted(sources),
      pending: statuses.get("pending") ?? 0,
    },
    refunds: {
      requested: [...refundStatuses.values()].reduce((s, v) => s + v, 0),
      completed: refundsCompleted,
      rate: settledCount ? refundsCompleted / settledCount : 0,
      statuses: sorted(refundStatuses, (k) => k.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase())),
    },
    downloads: { authorized, denied: [...denials.values()].reduce((s, v) => s + v, 0), trend: toRows(downloadTrend), versions: sorted(versions).slice(0, 8), denials: sorted(denials) },
    verifications: { total: [...verificationResults.values()].reduce((s, v) => s + v, 0), valid: verificationResults.get("valid") ?? 0, results: sorted(verificationResults, (k) => k.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase())) },
    support: { total: tickets.length, trend: toRows(ticketTrend), statuses: sorted(ticketStatuses, (k) => TICKET_STATUS_LABELS[k as TicketStatus] ?? k), categories: sorted(ticketCategories).slice(0, 6) },
    customers: { added: customers.length, trend: toRows(customerTrend), sources: sorted(customerSources) },
    email: { sent: emailStatus.get("sent") ?? 0, failed: emailStatus.get("failed") ?? 0, skipped: emailStatus.get("skipped") ?? 0 },
  };
}

export type Analytics = Awaited<ReturnType<typeof getAnalytics>>;
