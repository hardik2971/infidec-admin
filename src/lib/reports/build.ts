import "server-only";

import { Timestamp, type DocumentData } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { APP_TIME_ZONE } from "@/lib/format";
import { LICENSE_TYPE_LABELS, ORDER_STATUS_LABELS, marketplaceLabel, type LicenseType, type OrderStatus } from "@/lib/sales/schema";
import { TICKET_STATUS_LABELS, type TicketStatus } from "@/lib/support/schema";
import { REPORT_INFO, type Report, type ReportColumn, type ReportFilters, type ReportRow } from "./schema";

const MAX_ROWS = 20_000;
const SETTLED = new Set(["completed", "partially_refunded"]);
type Doc = DocumentData & { id: string };

/** Offset of the app time zone (e.g. "+05:30") so date filters follow the business day. */
function tzOffset(date: string) {
  const part = new Intl.DateTimeFormat("en-US", { timeZone: APP_TIME_ZONE, timeZoneName: "longOffset" })
    .formatToParts(new Date(`${date}T12:00:00Z`))
    .find((p) => p.type === "timeZoneName")?.value;
  const m = part?.match(/GMT([+-]\d{2}:\d{2})/);
  return m ? m[1] : "Z";
}
function bounds(f: ReportFilters) {
  return {
    start: Timestamp.fromDate(new Date(`${f.from}T00:00:00${tzOffset(f.from)}`)),
    end: Timestamp.fromDate(new Date(`${f.to}T23:59:59.999${tzOffset(f.to)}`)),
  };
}
const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
const day = (v: unknown) => (v instanceof Timestamp ? dayFmt.format(v.toDate()) : null);
const month = (v: unknown) => day(v)?.slice(0, 7) ?? null;
const cap = (s: string) => s.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
const maskKey = (k: string) => (k.length > 12 ? `${k.slice(0, 4)}…${k.slice(-5)}` : k);

async function ranged(collection: keyof typeof COLLECTIONS, field: string, f: ReportFilters): Promise<Doc[]> {
  const { start, end } = bounds(f);
  const snap = await adminDb.collection(COLLECTIONS[collection]).where(field, ">=", start).where(field, "<=", end).limit(MAX_ROWS).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function lookups() {
  const [products, customers] = await Promise.all([
    adminDb.collection(COLLECTIONS.products).select("name").get(),
    adminDb.collection(COLLECTIONS.customers).select("name", "email").get(),
  ]);
  const p = new Map(products.docs.map((d) => [d.id, String(d.get("name") ?? d.id)]));
  const c = new Map(customers.docs.map((d) => [d.id, { name: String(d.get("name") ?? ""), email: String(d.get("email") ?? "") }]));
  return { product: (id: unknown) => p.get(String(id)) ?? "—", customer: (id: unknown) => c.get(String(id)) ?? { name: "—", email: "" } };
}

const col = (key: string, label: string, kind: ReportColumn["kind"] = "text"): ReportColumn => ({ key, label, kind });

export async function buildReport(f: ReportFilters): Promise<Report> {
  const info = REPORT_INFO[f.type];
  const L = await lookups();
  const byProduct = (d: Doc) => !f.productId || d.productId === f.productId;
  const byMarketplace = (d: Doc) => !f.marketplace || !info.marketplaceFilter || d.marketplace === f.marketplace;
  const notes: string[] = [];
  let columns: ReportColumn[] = [];
  let rows: ReportRow[] = [];

  switch (f.type) {
    case "product_sales": {
      const orders = (await ranged("orders", "purchaseDate", f)).filter(byProduct).filter(byMarketplace);
      const g = new Map<string, ReportRow>();
      for (const o of orders.filter((o) => SETTLED.has(o.status))) {
        const key = `${o.productId}|${o.currency}`;
        const r = g.get(key) ?? { product: L.product(o.productId), currency: String(o.currency ?? ""), orders: 0, regular: 0, extended: 0, gross: 0, earned: 0 };
        r.orders = Number(r.orders) + 1;
        if (o.licenseType === "extended") r.extended = Number(r.extended) + 1;
        else r.regular = Number(r.regular) + 1;
        r.gross = Number(r.gross) + Number(o.grossAmount ?? 0);
        r.earned = Number(r.earned) + (o.channel === "marketplace" ? Number(o.authorEarnings ?? 0) : Number(o.grossAmount ?? 0));
        g.set(key, r);
      }
      columns = [col("product", "Product"), col("currency", "Currency"), col("orders", "Orders", "number"), col("regular", "Regular", "number"), col("extended", "Extended", "number"), col("gross", "Gross", "money"), col("earned", "Earned", "money")];
      rows = [...g.values()].sort((a, b) => Number(b.earned) - Number(a.earned));
      notes.push("Settled orders only (completed or partially refunded). Earned = marketplace author earnings, or the full amount for direct sales.");
      break;
    }
    case "marketplace_sales":
    case "direct_sales": {
      const channel = f.type === "marketplace_sales" ? "marketplace" : "direct";
      const orders = (await ranged("orders", "purchaseDate", f)).filter((o) => o.channel === channel).filter(byProduct).filter(byMarketplace);
      rows = orders
        .sort((a, b) => (b.purchaseDate?.toMillis?.() ?? 0) - (a.purchaseDate?.toMillis?.() ?? 0))
        .map((o) => ({
          date: day(o.purchaseDate),
          order: String(o.orderNumber ?? o.id),
          product: L.product(o.productId),
          customer: L.customer(o.customerId).name,
          email: L.customer(o.customerId).email,
          marketplace: marketplaceLabel(String(o.marketplace ?? "")),
          license: LICENSE_TYPE_LABELS[o.licenseType as LicenseType] ?? String(o.licenseType ?? ""),
          currency: String(o.currency ?? ""),
          gross: Number(o.grossAmount ?? 0),
          earnings: o.authorEarnings == null ? null : Number(o.authorEarnings),
          status: ORDER_STATUS_LABELS[o.status as OrderStatus] ?? String(o.status),
          payment: cap(String(o.paymentStatus ?? "")),
          verification: cap(String(o.verificationStatus ?? "unverified")),
          source: o.source === "website" ? "Website import" : cap(String(o.source ?? "manual")),
        }));
      columns =
        channel === "marketplace"
          ? [col("date", "Date", "date"), col("order", "Order"), col("product", "Product"), col("customer", "Customer"), col("marketplace", "Marketplace"), col("license", "License"), col("currency", "Currency"), col("gross", "Gross", "money"), col("earnings", "Author earnings", "money"), col("status", "Status"), col("verification", "Verification")]
          : [col("date", "Date", "date"), col("order", "Order"), col("product", "Product"), col("customer", "Customer"), col("email", "Email"), col("license", "License"), col("currency", "Currency"), col("gross", "Amount", "money"), col("status", "Status"), col("payment", "Payment"), col("source", "Source")];
      notes.push(
        channel === "marketplace"
          ? "Only orders verified through the Envato API are marked Verified; manual entries stay Unverified."
          : "Website orders are imported as pending until staff confirm the payment; pending rows are not revenue.",
      );
      break;
    }
    case "revenue": {
      const [orders, refunds] = await Promise.all([ranged("orders", "purchaseDate", f), ranged("refunds", "createdAt", f)]);
      const g = new Map<string, ReportRow>();
      const row = (m: string, currency: string) => {
        const k = `${m}|${currency}`;
        const r = g.get(k) ?? { month: m, currency, marketplace: 0, direct: 0, total: 0, refunds: 0, net: 0 };
        g.set(k, r);
        return r;
      };
      for (const o of orders.filter(byProduct).filter(byMarketplace).filter((o) => SETTLED.has(o.status))) {
        const r = row(month(o.purchaseDate) ?? "?", String(o.currency ?? ""));
        if (o.channel === "marketplace") r.marketplace = Number(r.marketplace) + Number(o.authorEarnings ?? 0);
        else r.direct = Number(r.direct) + Number(o.grossAmount ?? 0);
      }
      for (const x of refunds.filter(byProduct).filter(byMarketplace).filter((x) => x.status === "completed")) {
        const r = row(month(x.createdAt) ?? "?", String(x.currency ?? ""));
        r.refunds = Number(r.refunds) + Number(x.amount ?? 0);
      }
      for (const r of g.values()) {
        r.total = Number(r.marketplace) + Number(r.direct);
        r.net = Number(r.total) - Number(r.refunds);
      }
      columns = [col("month", "Month"), col("currency", "Currency"), col("marketplace", "Marketplace earnings", "money"), col("direct", "Direct revenue", "money"), col("total", "Total revenue", "money"), col("refunds", "Refunds", "money"), col("net", "Net", "money")];
      rows = [...g.values()].sort((a, b) => String(a.month).localeCompare(String(b.month)) || String(a.currency).localeCompare(String(b.currency)));
      notes.push("Marketplace figures are author earnings recorded on each order (verified via Envato where available). Refunds are counted in the month they were requested.");
      break;
    }
    case "customers": {
      const [customers, orders] = await Promise.all([ranged("customers", "createdAt", f), adminDb.collection(COLLECTIONS.orders).select("customerId").get()]);
      const counts = new Map<string, number>();
      for (const o of orders.docs) counts.set(o.get("customerId"), (counts.get(o.get("customerId")) ?? 0) + 1);
      rows = customers
        .filter((c) => !f.productId || (Array.isArray(c.productIds) && c.productIds.includes(f.productId)))
        .map((c) => ({
          created: day(c.createdAt),
          name: String(c.name ?? ""),
          email: String(c.email ?? ""),
          country: String(c.country ?? ""),
          company: String(c.company ?? ""),
          source: cap(String(c.source ?? "manual")),
          status: cap(String(c.status ?? "active")),
          orders: counts.get(c.id) ?? 0,
          products: Array.isArray(c.productIds) ? c.productIds.length : 0,
        }));
      columns = [col("created", "Added", "date"), col("name", "Name"), col("email", "Email"), col("country", "Country"), col("company", "Company"), col("source", "Source"), col("status", "Status"), col("orders", "Orders", "number"), col("products", "Products", "number")];
      break;
    }
    case "licenses": {
      const licenses = (await ranged("licenses", "purchaseDate", f)).filter(byProduct).filter(byMarketplace);
      const now = Date.now();
      rows = licenses.map((l) => ({
        purchased: day(l.purchaseDate),
        key: maskKey(String(l.licenseKey ?? "")),
        product: L.product(l.productId),
        customer: L.customer(l.customerId).name,
        marketplace: marketplaceLabel(String(l.marketplace ?? "")),
        license: LICENSE_TYPE_LABELS[l.licenseType as LicenseType] ?? String(l.licenseType ?? ""),
        supportUntil: day(l.supportExpiry),
        support: l.supportExpiry instanceof Timestamp && l.supportExpiry.toMillis() > now && l.status === "active" ? "Active" : "Expired",
        verification: cap(String(l.verificationStatus ?? "unverified")),
        status: cap(String(l.status ?? "active")),
      }));
      columns = [col("purchased", "Purchased", "date"), col("key", "License"), col("product", "Product"), col("customer", "Customer"), col("marketplace", "Marketplace"), col("license", "Type"), col("supportUntil", "Support until", "date"), col("support", "Support"), col("verification", "Verification"), col("status", "Status")];
      notes.push("License keys are shortened in reports.");
      break;
    }
    case "downloads": {
      const logs = (await ranged("downloadLogs", "createdAt", f)).filter(byProduct);
      rows = logs
        .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
        .map((d) => ({
          date: day(d.createdAt),
          customer: L.customer(d.customerId).name,
          product: d.productId ? L.product(d.productId) : "—",
          version: d.version ? `v${d.version}` : "—",
          file: String(d.fileName ?? ""),
          result: d.result === "authorized" ? "Authorized" : "Denied",
          reason: d.reason ? cap(String(d.reason)) : "",
          issuedBy: d.issuedBy === "customer" ? "Customer" : String(d.issuedByEmail ?? "Staff"),
        }));
      columns = [col("date", "Date", "date"), col("customer", "Customer"), col("product", "Product"), col("version", "Version"), col("file", "File"), col("result", "Result"), col("reason", "Reason"), col("issuedBy", "Issued by")];
      break;
    }
    case "refunds": {
      const refunds = (await ranged("refunds", "createdAt", f)).filter(byProduct).filter(byMarketplace);
      rows = refunds.map((r) => ({
        date: day(r.createdAt),
        number: String(r.number ?? r.id),
        order: String(r.orderNumber ?? ""),
        product: L.product(r.productId),
        customer: L.customer(r.customerId).name,
        marketplace: marketplaceLabel(String(r.marketplace ?? "")),
        currency: String(r.currency ?? ""),
        amount: Number(r.amount ?? 0),
        status: cap(String(r.status ?? "")),
        reason: String(r.reason ?? ""),
      }));
      columns = [col("date", "Requested", "date"), col("number", "Refund"), col("order", "Order"), col("product", "Product"), col("customer", "Customer"), col("marketplace", "Marketplace"), col("currency", "Currency"), col("amount", "Amount", "money"), col("status", "Status"), col("reason", "Reason")];
      break;
    }
    case "support_tickets": {
      const tickets = (await ranged("supportTickets", "createdAt", f)).filter(byProduct);
      rows = tickets.map((t) => ({
        created: day(t.createdAt),
        number: String(t.number ?? t.id),
        subject: String(t.subject ?? ""),
        product: t.productId ? L.product(t.productId) : "—",
        customer: L.customer(t.customerId).name,
        category: String(t.category ?? ""),
        priority: cap(String(t.priority ?? "normal")),
        status: TICKET_STATUS_LABELS[t.status as TicketStatus] ?? String(t.status),
        lastActivity: day(t.lastMessageAt ?? t.updatedAt),
      }));
      columns = [col("created", "Opened", "date"), col("number", "Ticket"), col("subject", "Subject"), col("product", "Product"), col("customer", "Customer"), col("category", "Category"), col("priority", "Priority"), col("status", "Status"), col("lastActivity", "Last activity", "date")];
      break;
    }
    case "version_adoption": {
      const [versions, logs] = await Promise.all([
        adminDb.collection(COLLECTIONS.productVersions).select("productId", "version", "status", "releaseDate", "publishedAt").get(),
        ranged("downloadLogs", "createdAt", f),
      ]);
      const stats = new Map<string, { downloads: number; customers: Set<string> }>();
      for (const d of logs.filter((d) => d.result === "authorized" && d.versionId)) {
        const s = stats.get(d.versionId) ?? { downloads: 0, customers: new Set<string>() };
        s.downloads++;
        s.customers.add(String(d.customerId));
        stats.set(d.versionId, s);
      }
      rows = versions.docs
        .filter((v) => !f.productId || v.get("productId") === f.productId)
        .filter((v) => v.get("status") !== "draft")
        .map((v) => ({
          product: L.product(v.get("productId")),
          version: `v${v.get("version")}`,
          status: cap(String(v.get("status") ?? "")),
          released: typeof v.get("releaseDate") === "string" ? String(v.get("releaseDate")).slice(0, 10) : day(v.get("publishedAt")),
          downloads: stats.get(v.id)?.downloads ?? 0,
          customers: stats.get(v.id)?.customers.size ?? 0,
        }))
        .sort((a, b) => String(a.product).localeCompare(String(b.product)) || String(b.released ?? "").localeCompare(String(a.released ?? "")));
      columns = [col("product", "Product"), col("version", "Version"), col("status", "Status"), col("released", "Released", "date"), col("downloads", "Downloads", "number"), col("customers", "Unique customers", "number")];
      notes.push("Download counts cover the selected period; draft versions are excluded.");
      break;
    }
    case "storage_usage": {
      const [packages, media, docs] = await Promise.all([
        adminDb.collection(COLLECTIONS.productPackages).select("productId", "fileSize", "status").get(),
        adminDb.collection(COLLECTIONS.productMedia).select("productId", "size").get(),
        adminDb.collection(COLLECTIONS.productDocumentation).select("productId", "attachments").get(),
      ]);
      const g = new Map<string, { packages: number; packageBytes: number; archived: number; media: number; mediaBytes: number; attachments: number; attachmentBytes: number }>();
      const get = (id: string) => {
        const r = g.get(id) ?? { packages: 0, packageBytes: 0, archived: 0, media: 0, mediaBytes: 0, attachments: 0, attachmentBytes: 0 };
        g.set(id, r);
        return r;
      };
      for (const p of packages.docs) {
        const r = get(String(p.get("productId")));
        if (p.get("status") === "active") r.packages++;
        else r.archived++;
        r.packageBytes += Number(p.get("fileSize") ?? 0);
      }
      for (const m of media.docs) {
        const r = get(String(m.get("productId")));
        r.media++;
        r.mediaBytes += Number(m.get("size") ?? 0);
      }
      for (const d of docs.docs) {
        const list = Array.isArray(d.get("attachments")) ? (d.get("attachments") as { size?: number }[]) : [];
        if (!list.length) continue;
        const r = get(String(d.get("productId")));
        r.attachments += list.length;
        r.attachmentBytes += list.reduce((s, a) => s + Number(a.size ?? 0), 0);
      }
      rows = [...g.entries()]
        .filter(([id]) => !f.productId || id === f.productId)
        .map(([id, r]) => ({ product: L.product(id), ...r, total: r.packageBytes + r.mediaBytes + r.attachmentBytes }))
        .sort((a, b) => b.total - a.total);
      columns = [col("product", "Product"), col("packages", "Active packages", "number"), col("archived", "Older packages", "number"), col("packageBytes", "Package size", "bytes"), col("media", "Images", "number"), col("mediaBytes", "Image size", "bytes"), col("attachments", "Doc files", "number"), col("attachmentBytes", "Doc file size", "bytes"), col("total", "Total", "bytes")];
      notes.push("Current totals from file records — not limited to the date range.");
      break;
    }
  }

  if (rows.length >= MAX_ROWS) notes.push(`Limited to the first ${MAX_ROWS.toLocaleString("en-IN")} records — narrow the date range for a complete report.`);
  return { filters: f, title: info.label, columns, rows, notes, generatedAt: new Date().toISOString() };
}
