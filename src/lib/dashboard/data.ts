import "server-only";

import { eachDayOfInterval, eachMonthOfInterval, format } from "date-fns";
import { AggregateField, Timestamp, type Query } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { marketplaceLabel } from "@/lib/sales/schema";
import { resolveRange, type DashboardFilters } from "./range";

/**
 * Dashboard metrics, computed only from real Firestore records.
 *
 * Money is stored in minor units (cents) on orders:
 *   grossAmount     — what the buyer paid
 *   authorEarnings  — marketplace payout to INFIDEC (marketplace orders only)
 *   channel         — "marketplace" | "direct"
 * Revenue that INFIDEC actually earns = marketplace author earnings + direct gross.
 *
 * Every section is computed independently so a missing index or empty
 * collection degrades that section only.
 */

export type Section<T> = { ok: true; data: T } | { ok: false; error: string };

async function section<T>(name: string, fn: () => Promise<T>): Promise<Section<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[dashboard] ${name} failed:`, message);
    const needsIndex = message.includes("FAILED_PRECONDITION") || message.toLowerCase().includes("index");
    return {
      ok: false,
      error: needsIndex ? "A Firestore index is required. Deploy firestore.indexes.json." : "Could not load this data.",
    };
  }
}

const SETTLED_STATUSES = new Set(["completed", "partially_refunded"]);
const OPEN_TICKET_STATUSES = ["open", "in_progress", "waiting_customer"];
const MAX_ORDER_SCAN = 10_000;
const MAX_EVENT_SCAN = 20_000;

async function count(q: Query) {
  return (await q.count().get()).data().count;
}

function scoped(q: Query, productId?: string) {
  return productId ? q.where("productId", "==", productId) : q;
}

function toDate(v: unknown): Date | null {
  if (v instanceof Timestamp) return v.toDate();
  if (v instanceof Date) return v;
  if (typeof v === "string" || typeof v === "number") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export interface ProductOption {
  id: string;
  name: string;
}

export async function getProductOptions(): Promise<ProductOption[]> {
  const snap = await adminDb.collection(COLLECTIONS.products).select("name").limit(500).get();
  return snap.docs
    .map((d) => ({ id: d.id, name: String(d.get("name") ?? d.id) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getDashboardData(filters: DashboardFilters) {
  const range = resolveRange(filters);
  const { productId } = filters;
  const startTs = Timestamp.fromDate(range.start);
  const endTs = Timestamp.fromDate(range.end);
  const db = adminDb;

  const settingsSnap = await db.collection(COLLECTIONS.systemSettings).doc("general").get();
  const baseCurrency = String(settingsSnap.get("baseCurrency") ?? "USD");

  const buckets =
    range.bucket === "day"
      ? eachDayOfInterval({ start: range.start, end: range.end }).map((d) => format(d, "yyyy-MM-dd"))
      : eachMonthOfInterval({ start: range.start, end: range.end }).map((d) => format(d, "yyyy-MM"));
  const bucketKey = (d: Date) => format(d, range.bucket === "day" ? "yyyy-MM-dd" : "yyyy-MM");

  const [catalogue, sales, customers, licenses, downloads, packages, support] = await Promise.all([
    section("catalogue", async () => {
      const products = db.collection(COLLECTIONS.products);
      const [total, published, draft] = await Promise.all([
        count(products),
        count(products.where("status", "==", "published")),
        count(products.where("status", "==", "draft")),
      ]);
      return { total, published, draft };
    }),

    section("sales", async () => {
      const orders = db.collection(COLLECTIONS.orders);
      const inRange = scoped(orders, productId)
        .where("purchaseDate", ">=", startTs)
        .where("purchaseDate", "<=", endTs)
        .select("productId", "channel", "marketplace", "grossAmount", "authorEarnings", "currency", "status", "purchaseDate")
        .limit(MAX_ORDER_SCAN);

      const [snap, pending] = await Promise.all([
        inRange.get(),
        count(scoped(orders, productId).where("status", "==", "pending")),
      ]);

      let marketplaceSales = 0;
      let directSales = 0;
      let grossSales = 0;
      let marketplaceEarnings = 0;
      let directRevenue = 0;
      let otherCurrencyOrders = 0;
      const trend = new Map(buckets.map((b) => [b, { sales: 0, gross: 0, revenue: 0 }]));
      const byProduct = new Map<string, { sales: number; revenue: number }>();
      const byMarketplace = new Map<string, number>();

      for (const doc of snap.docs) {
        const o = doc.data();
        if (!SETTLED_STATUSES.has(o.status)) continue;
        if ((o.currency ?? baseCurrency) !== baseCurrency) {
          otherCurrencyOrders++;
          continue;
        }
        const gross = Number(o.grossAmount) || 0;
        const isDirect = o.channel === "direct";
        const earned = isDirect ? gross : Number(o.authorEarnings) || 0;

        grossSales += gross;
        if (isDirect) {
          directSales++;
          directRevenue += gross;
        } else {
          marketplaceSales++;
          marketplaceEarnings += earned;
        }

        const date = toDate(o.purchaseDate);
        const point = date ? trend.get(bucketKey(date)) : undefined;
        if (point) {
          point.sales++;
          point.gross += gross;
          point.revenue += earned;
        }

        const pid = String(o.productId ?? "unknown");
        const p = byProduct.get(pid) ?? { sales: 0, revenue: 0 };
        p.sales++;
        p.revenue += earned;
        byProduct.set(pid, p);

        const channelName = isDirect ? "INFIDEC Website" : marketplaceLabel(String(o.marketplace ?? "Marketplace"));
        byMarketplace.set(channelName, (byMarketplace.get(channelName) ?? 0) + 1);
      }

      return {
        marketplaceSales,
        directSales,
        grossSales,
        marketplaceEarnings,
        directRevenue,
        totalRevenue: marketplaceEarnings + directRevenue,
        pendingOrders: pending,
        otherCurrencyOrders,
        truncated: snap.size >= MAX_ORDER_SCAN,
        trend: [...trend.entries()].map(([bucket, v]) => ({ bucket, ...v })),
        byProduct: [...byProduct.entries()].map(([productId, v]) => ({ productId, ...v })),
        byMarketplace: [...byMarketplace.entries()].map(([name, sales]) => ({ name, sales })),
      };
    }),

    section("customers", async () => {
      const base = db.collection(COLLECTIONS.customers);
      const scopedBase = productId ? base.where("productIds", "array-contains", productId) : base;
      const [total, newSnap] = await Promise.all([
        count(scopedBase),
        scopedBase
          .where("createdAt", ">=", startTs)
          .where("createdAt", "<=", endTs)
          .select("createdAt")
          .limit(MAX_EVENT_SCAN)
          .get(),
      ]);
      const acquisition = new Map(buckets.map((b) => [b, 0]));
      for (const d of newSnap.docs) {
        const date = toDate(d.get("createdAt"));
        if (date && acquisition.has(bucketKey(date))) acquisition.set(bucketKey(date), acquisition.get(bucketKey(date))! + 1);
      }
      return {
        total,
        newInRange: newSnap.size,
        acquisition: [...acquisition.entries()].map(([bucket, customers]) => ({ bucket, customers })),
      };
    }),

    section("licenses", async () => {
      const base = scoped(db.collection(COLLECTIONS.licenses), productId);
      const [active, regular, extended, custom] = await Promise.all([
        count(base.where("status", "==", "active")),
        count(base.where("licenseType", "==", "regular")),
        count(base.where("licenseType", "==", "extended")),
        count(base.where("licenseType", "==", "custom")),
      ]);
      return {
        active,
        distribution: [
          { type: "regular", label: "Regular", count: regular },
          { type: "extended", label: "Extended", count: extended },
          { type: "custom", label: "Custom", count: custom },
        ],
      };
    }),

    section("downloads", async () => {
      const base = scoped(db.collection(COLLECTIONS.downloadLogs), productId);
      const [total, snap] = await Promise.all([
        count(base),
        base.where("createdAt", ">=", startTs).where("createdAt", "<=", endTs).select("createdAt").limit(MAX_EVENT_SCAN).get(),
      ]);
      const activity = new Map(buckets.map((b) => [b, 0]));
      for (const d of snap.docs) {
        const date = toDate(d.get("createdAt"));
        if (date && activity.has(bucketKey(date))) activity.set(bucketKey(date), activity.get(bucketKey(date))! + 1);
      }
      return {
        total,
        inRange: snap.size,
        activity: [...activity.entries()].map(([bucket, downloads]) => ({ bucket, downloads })),
      };
    }),

    section("packages", async () => {
      const base = scoped(db.collection(COLLECTIONS.productPackages), productId).where("status", "==", "active");
      const agg = await base.aggregate({ total: AggregateField.count(), bytes: AggregateField.sum("fileSize") }).get();
      return { total: agg.data().total, storageBytes: Number(agg.data().bytes ?? 0) };
    }),

    section("support", async () => {
      const base = scoped(db.collection(COLLECTIONS.supportTickets), productId);
      return { open: await count(base.where("status", "in", OPEN_TICKET_STATUSES)) };
    }),
  ]);

  return { range, baseCurrency, bucket: range.bucket, catalogue, sales, customers, licenses, downloads, packages, support };
}

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;
