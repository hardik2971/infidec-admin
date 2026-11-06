import "server-only";

import { FieldValue, type QuerySnapshot } from "firebase-admin/firestore";
import catalog from "../../../data/website-catalog.json";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { ensureCategory } from "./categories";
import { addProductMedia, MAX_IMAGE_BYTES } from "./media";
import { publishBlockers, slugify, type ProductStatus } from "./schema";
import { ProductError, getProduct } from "./service";

export type CatalogProduct = (typeof catalog.products)[number];

/** Only the official website may be fetched during import. */
const ALLOWED_ORIGIN = "https://infidec.com";

export function getCatalogSource() {
  return catalog.source;
}

export interface ImportPreviewItem {
  sourceSlug: string;
  name: string;
  tagline: string;
  category: string;
  version: string;
  releaseDate: string | null;
  regularPrice: number;
  extendedPrice: number;
  compareAtPrice: number | null;
  currency: string;
  screenshots: number;
  hasThumbnail: boolean;
  productUrl: string;
  liveVerification: { ok: boolean; mismatches: string[]; checkedAt: string } | null;
  duplicate: { productId: string; name: string; reason: string } | null;
}

async function findDuplicate(p: CatalogProduct): Promise<ImportPreviewItem["duplicate"]> {
  const products = adminDb.collection(COLLECTIONS.products);
  const checks: [string, Promise<QuerySnapshot>][] = [
    ["imported from the same website product", products.where("source.sourceSlug", "==", p.sourceSlug).limit(1).get()],
    ["same slug", products.where("slug", "==", p.sourceSlug).limit(1).get()],
    ["same product name", products.where("nameKey", "==", slugify(p.name)).limit(1).get()],
  ];
  for (const [reason, query] of checks) {
    const snap = await query;
    if (!snap.empty) return { productId: snap.docs[0].id, name: String(snap.docs[0].get("name")), reason };
  }
  return null;
}

export async function getImportPreview(): Promise<ImportPreviewItem[]> {
  const labels = new Map(catalog.categories.map((c) => [c.key, c.label]));
  return Promise.all(
    catalog.products.map(async (p) => ({
      sourceSlug: p.sourceSlug,
      name: p.name,
      tagline: p.tagline,
      category: labels.get(p.categoryKey) ?? p.categoryKey,
      version: p.version,
      releaseDate: p.releaseDate,
      regularPrice: p.pricing.regular,
      extendedPrice: p.pricing.extended,
      compareAtPrice: p.pricing.compareAt,
      currency: p.pricing.currency,
      screenshots: p.media.screenshots.length,
      hasThumbnail: !!p.media.thumbnail,
      productUrl: p.productUrl,
      liveVerification: (p as { liveVerification?: ImportPreviewItem["liveVerification"] }).liveVerification ?? null,
      duplicate: await findDuplicate(p),
    })),
  );
}

async function fetchImage(url: string): Promise<Buffer> {
  const parsed = new URL(url);
  if (parsed.origin !== ALLOWED_ORIGIN) throw new Error(`Blocked non-INFIDEC URL ${parsed.origin}`);
  const res = await fetch(parsed, { signal: AbortSignal.timeout(30_000), redirect: "error" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const length = Number(res.headers.get("content-length") ?? 0);
  if (length > MAX_IMAGE_BYTES) throw new Error("Image larger than 15 MB");
  return Buffer.from(await res.arrayBuffer());
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i], i);
      }
    }),
  );
  return results;
}

export interface ImportResult {
  productId: string;
  name: string;
  status: ProductStatus;
  imagesImported: number;
  imageFailures: { url: string; error: string }[];
  notes: string[];
}

/** Imports one website product after a fresh duplicate check. */
export async function importCatalogProduct(sourceSlug: string, requestedStatus: "published" | "draft", actorId: string): Promise<ImportResult> {
  const p = catalog.products.find((x) => x.sourceSlug === sourceSlug);
  if (!p) throw new ProductError("That product is not in the website catalogue snapshot.");
  const duplicate = await findDuplicate(p);
  if (duplicate) throw new ProductError(`"${p.name}" already exists (${duplicate.reason}).`);

  const category = catalog.categories.find((c) => c.key === p.categoryKey);
  const categoryId = await ensureCategory(p.categoryKey, category?.label ?? p.categoryKey, actorId);

  const productsCol = adminDb.collection(COLLECTIONS.products);
  const ref = productsCol.doc();
  const toMinor = (n: number | null) => (n === null ? null : Math.round(n * 100));
  const demo = p.demoLinks.find((d) => /website/i.test(d.label)) ?? p.demoLinks[0];

  await adminDb.runTransaction(async (tx) => {
    const clash = await tx.get(productsCol.where("slug", "==", p.sourceSlug).limit(1));
    if (!clash.empty) throw new ProductError(`The slug "${p.sourceSlug}" is already used.`);
    tx.set(ref, {
      status: "draft",
      name: p.name,
      nameKey: slugify(p.name),
      slug: p.sourceSlug,
      title: p.title,
      tagline: p.tagline,
      categoryId,
      productType: p.productType === "addon" ? "addon" : "app",
      shortDescription: p.shortDescription,
      fullDescription: p.fullDescription,
      version: p.version,
      releaseDate: p.releaseDate ?? "",
      lastUpdate: p.lastUpdate ?? "",
      platform: p.platform,
      techStack: p.techStack,
      integrations: p.integrations,
      modules: p.modules,
      demoUrl: demo?.url ?? "",
      demoLinks: p.demoLinks,
      websiteUrl: p.productUrl,
      docsUrl: p.docsUrl ?? "",
      changelogUrl: p.changelogUrl ?? "",
      marketplaceId: "infidec",
      marketplaceItemId: "",
      marketplaceUrl: p.productUrl,
      pricing: {
        currency: p.pricing.currency,
        regular: toMinor(p.pricing.regular),
        extended: toMinor(p.pricing.extended),
        compareAt: toMinor(p.pricing.compareAt),
      },
      licenseTypes: { regular: true, extended: true, custom: false },
      // The website licence table: 6 months of support for both licences.
      supportDurationMonths: 6,
      licenseNotes: "",
      seo: { title: p.seo.title, description: p.seo.description, keywords: [], canonicalUrl: p.seo.canonicalUrl },
      features: p.features,
      requirements: p.requirements,
      whatYouGet: p.whatYouGet,
      thumbnailMediaId: null,
      logoMediaId: null,
      source: {
        type: "website-import",
        url: p.productUrl,
        sourceSlug: p.sourceSlug,
        commit: catalog.source.commit,
        importedAt: FieldValue.serverTimestamp(),
      },
      wizard: null,
      createdBy: actorId,
      updatedBy: actorId,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  const jobs = [
    ...(p.media.thumbnail ? [{ kind: "thumbnail" as const, url: p.media.thumbnail.url, alt: p.media.thumbnail.alt, section: null }] : []),
    ...p.media.screenshots.map((s) => ({ kind: "screenshot" as const, url: s.url, alt: s.alt, section: s.section })),
  ];
  const imageFailures: ImportResult["imageFailures"] = [];
  let imagesImported = 0;
  // Download in parallel, then store one at a time so screenshots keep the website's order.
  const buffers = await mapLimit(jobs, 4, async (job) => {
    try {
      return await fetchImage(job.url);
    } catch (error) {
      imageFailures.push({ url: job.url, error: (error as Error).message });
      return null;
    }
  });

  for (const [i, job] of jobs.entries()) {
    const buffer = buffers[i];
    if (!buffer) continue;
    try {
      await addProductMedia({
        productId: ref.id,
        kind: job.kind,
        buffer,
        alt: job.alt,
        section: job.section,
        actorId,
        source: { type: "website-import", url: job.url },
      });
      imagesImported++;
    } catch (error) {
      imageFailures.push({ url: job.url, error: (error as Error).message });
    }
  }

  const notes: string[] = [];
  let status: ProductStatus = "draft";
  if (requestedStatus === "published") {
    const product = await getProduct(ref.id);
    const blockers = product ? publishBlockers(product) : ["product"];
    if (blockers.length) {
      notes.push(`Kept as draft — missing: ${blockers.join(", ")}.`);
    } else {
      await ref.update({ status: "published", publishedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      status = "published";
    }
  }
  notes.push("No logo is published on the website; add one under Media.");

  return { productId: ref.id, name: p.name, status, imagesImported, imageFailures, notes };
}
