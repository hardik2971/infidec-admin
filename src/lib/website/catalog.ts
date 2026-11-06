import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { DomainError } from "@/lib/actions";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { getIntegrationStatus } from "@/lib/integrations/settings";

/** Compares admin product prices with what the live website shows (JSON-LD + visible price labels). */

export interface WebsitePrices {
  regular: number | null; // minor units
  extended: number | null;
  compareAt: number | null;
  currency: string | null;
  name: string | null;
}

export interface CatalogDrift {
  productId: string;
  productName: string;
  slug: string;
  url: string;
  ok: boolean;
  error: string | null;
  admin: { regular: number; extended: number | null; compareAt: number | null; currency: string };
  website: WebsitePrices | null;
  differences: string[];
}

const DEFAULT_BASE = "https://marketplace-infidec.web.app";
const rupees = (s: string | undefined) => (s ? Math.round(Number(s.replace(/[^\d.]/g, "")) * 100) : null);

export async function websiteBaseUrl() {
  const base = (await getIntegrationStatus("website")).publicConfig.baseUrl || DEFAULT_BASE;
  const u = new URL(base);
  if (u.protocol !== "https:") throw new DomainError("The website URL must use https.");
  return u.origin;
}

/** Parses a product page. Exported for tests. */
export function parseProductPage(html: string): WebsitePrices {
  const out: WebsitePrices = { regular: null, extended: null, compareAt: null, currency: null, name: null };
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      const data = JSON.parse(m[1]);
      for (const node of Array.isArray(data) ? data : [data]) {
        if (node?.["@type"] !== "Product") continue;
        const offer = Array.isArray(node.offers) ? node.offers[0] : node.offers;
        if (offer?.price != null) out.regular = Math.round(Number(offer.price) * 100);
        out.currency = offer?.priceCurrency ?? null;
        out.name = node.name ?? null;
      }
    } catch {
      // ignore malformed blocks
    }
  }
  const text = html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
  const ext = text.match(/Extended License\s*(₹[\d,]+)/);
  if (ext) out.extended = rupees(ext[1]);
  const reg = text.match(/Regular License\s*(₹[\d,]+)\s*(₹[\d,]+)?/);
  if (reg) {
    // With two amounts the first is the struck-through original price.
    const [a, b] = [rupees(reg[1]), rupees(reg[2])];
    if (b != null) {
      out.compareAt = a;
      out.regular ??= b;
    } else out.regular ??= a;
  }
  return out;
}

async function productsForSync() {
  const snap = await adminDb.collection(COLLECTIONS.products).select("name", "slug", "source", "pricing", "status").get();
  return snap.docs
    .filter((d) => d.get("status") !== "archived")
    .map((d) => ({
      id: d.id,
      name: String(d.get("name") ?? ""),
      slug: String(d.get("source")?.sourceSlug || d.get("slug") || ""),
      pricing: {
        regular: Number(d.get("pricing")?.regular ?? 0),
        extended: d.get("pricing")?.extended ?? null,
        compareAt: d.get("pricing")?.compareAt ?? null,
        currency: String(d.get("pricing")?.currency ?? "INR"),
      },
    }))
    .filter((p) => p.slug);
}

export async function checkCatalogDrift(fetcher: typeof fetch = fetch): Promise<CatalogDrift[]> {
  const base = await websiteBaseUrl();
  const products = await productsForSync();
  return Promise.all(
    products.map(async (p): Promise<CatalogDrift> => {
      const url = `${base}/products/${encodeURIComponent(p.slug)}`;
      const row: CatalogDrift = { productId: p.id, productName: p.name, slug: p.slug, url, ok: false, error: null, admin: p.pricing, website: null, differences: [] };
      try {
        const res = await fetcher(url, { signal: AbortSignal.timeout(20_000), redirect: "error", cache: "no-store" });
        if (res.status === 404) throw new Error("Not on the website (404).");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const w = parseProductPage(await res.text());
        row.website = w;
        if (w.regular == null) throw new Error("No price found on the page.");
        if (w.currency && w.currency !== p.pricing.currency) row.differences.push(`Currency: admin ${p.pricing.currency}, website ${w.currency}`);
        if (w.regular !== p.pricing.regular) row.differences.push("Regular price");
        if (w.extended != null && w.extended !== p.pricing.extended) row.differences.push("Extended price");
        if ((w.compareAt ?? null) !== (p.pricing.compareAt || null)) row.differences.push("Original (compare-at) price");
        row.ok = row.differences.length === 0;
      } catch (error) {
        row.error = (error as Error).message;
      }
      return row;
    }),
  );
}

/** Copies the website's prices onto the admin product (same currency only). */
export async function applyWebsitePrices(productId: string, actorId: string, fetcher: typeof fetch = fetch) {
  const row = (await checkCatalogDrift(fetcher)).find((r) => r.productId === productId);
  if (!row) throw new DomainError("Product not found or not linked to a website page.");
  if (!row.website || row.website.regular == null) throw new DomainError(row.error ?? "Could not read the website price.");
  if (row.website.currency && row.website.currency !== row.admin.currency) throw new DomainError("Currencies differ — update the product's currency by hand first.");
  const pricing = {
    currency: row.admin.currency,
    regular: row.website.regular,
    extended: row.website.extended ?? row.admin.extended,
    compareAt: row.website.compareAt,
  };
  await adminDb.collection(COLLECTIONS.products).doc(productId).update({ pricing, updatedBy: actorId, updatedAt: FieldValue.serverTimestamp() });
  return { name: row.productName, before: row.admin, after: pricing };
}
