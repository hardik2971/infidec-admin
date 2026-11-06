import "server-only";

import { FieldValue, Timestamp, type DocumentData, type DocumentSnapshot, type Transaction } from "firebase-admin/firestore";
import { adminDb, adminStorage } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import {
  publishBlockers,
  slugify,
  type BasicValues,
  type ContentValues,
  type LicenseValues,
  type MarketplaceValues,
  type ProductMediaItem,
  type ProductRecord,
  type ProductStatus,
  type SectionKey,
  type SeoValues,
} from "./schema";

export class ProductError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductError";
  }
}

const products = () => adminDb.collection(COLLECTIONS.products);
const media = () => adminDb.collection(COLLECTIONS.productMedia);

const iso = (v: unknown) => (v instanceof Timestamp ? v.toDate().toISOString() : null);
const str = (v: unknown) => (typeof v === "string" ? v : "");
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

export function toProductRecord(snap: DocumentSnapshot<DocumentData>): ProductRecord {
  const d = snap.data() ?? {};
  return {
    id: snap.id,
    status: d.status ?? "draft",
    name: str(d.name),
    slug: str(d.slug),
    title: str(d.title),
    tagline: str(d.tagline),
    categoryId: str(d.categoryId),
    productType: d.productType ?? "app",
    shortDescription: str(d.shortDescription),
    fullDescription: str(d.fullDescription),
    version: str(d.version) || "1.0.0",
    releaseDate: str(d.releaseDate),
    platform: str(d.platform),
    techStack: strs(d.techStack),
    integrations: strs(d.integrations),
    modules: strs(d.modules),
    demoUrl: str(d.demoUrl),
    demoLinks: Array.isArray(d.demoLinks) ? d.demoLinks : [],
    websiteUrl: str(d.websiteUrl),
    marketplaceId: str(d.marketplaceId),
    marketplaceItemId: str(d.marketplaceItemId),
    marketplaceUrl: str(d.marketplaceUrl),
    pricing: {
      currency: d.pricing?.currency ?? "INR",
      regular: Number(d.pricing?.regular ?? 0),
      extended: d.pricing?.extended ?? null,
      compareAt: d.pricing?.compareAt ?? null,
    },
    licenseTypes: { regular: true, extended: !!d.licenseTypes?.extended, custom: !!d.licenseTypes?.custom },
    supportDurationMonths: Number(d.supportDurationMonths ?? 6),
    licenseNotes: str(d.licenseNotes),
    seo: {
      title: str(d.seo?.title),
      description: str(d.seo?.description),
      keywords: strs(d.seo?.keywords),
      canonicalUrl: str(d.seo?.canonicalUrl),
    },
    features: Array.isArray(d.features) ? d.features : [],
    requirements: Array.isArray(d.requirements) ? d.requirements : [],
    whatYouGet: strs(d.whatYouGet),
    thumbnailMediaId: d.thumbnailMediaId ?? null,
    logoMediaId: d.logoMediaId ?? null,
    source: d.source ? { ...d.source, importedAt: iso(d.source.importedAt) ?? undefined } : null,
    wizard: d.wizard ?? null,
    createdAt: iso(d.createdAt),
    updatedAt: iso(d.updatedAt),
    publishedAt: iso(d.publishedAt),
  };
}

export async function listProducts(): Promise<ProductRecord[]> {
  const snap = await products().orderBy("updatedAt", "desc").limit(1000).get();
  return snap.docs.map(toProductRecord);
}

export async function getProduct(id: string): Promise<ProductRecord | null> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return null;
  const snap = await products().doc(id).get();
  return snap.exists ? toProductRecord(snap) : null;
}

async function assertSlugFree(tx: Transaction, slug: string, exceptId?: string) {
  const clash = await tx.get(products().where("slug", "==", slug).limit(2));
  if (clash.docs.some((d) => d.id !== exceptId)) {
    throw new ProductError(`The slug "${slug}" is already used by another product.`);
  }
}

function basicFields(v: BasicValues) {
  return { ...v, nameKey: slugify(v.name) };
}

export async function createDraft(values: BasicValues, actorId: string): Promise<string> {
  const ref = products().doc();
  await adminDb.runTransaction(async (tx) => {
    await assertSlugFree(tx, values.slug);
    tx.set(ref, {
      ...basicFields(values),
      status: "draft" satisfies ProductStatus,
      demoLinks: [],
      marketplaceId: "",
      marketplaceItemId: "",
      marketplaceUrl: "",
      pricing: { currency: "INR", regular: 0, extended: null, compareAt: null },
      licenseTypes: { regular: true, extended: false, custom: false },
      supportDurationMonths: 6,
      licenseNotes: "",
      seo: { title: "", description: "", keywords: [], canonicalUrl: "" },
      features: [],
      requirements: [],
      whatYouGet: [],
      thumbnailMediaId: null,
      logoMediaId: null,
      source: { type: "manual" },
      wizard: { completedSteps: [1], lastStep: 1 },
      createdBy: actorId,
      updatedBy: actorId,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  return ref.id;
}

const toMinor = (major: number | null) => (major === null ? null : Math.round(major * 100));

type SectionValues = {
  basic: BasicValues;
  marketplace: MarketplaceValues;
  license: LicenseValues;
  seo: SeoValues;
  content: ContentValues;
};

function sectionFields<K extends SectionKey>(section: K, values: SectionValues[K]): Record<string, unknown> {
  switch (section) {
    case "basic":
      return basicFields(values as BasicValues);
    case "marketplace":
      return { ...(values as MarketplaceValues) };
    case "license": {
      const v = values as LicenseValues;
      return {
        pricing: {
          currency: v.currency,
          regular: toMinor(v.regularPrice),
          extended: v.extendedEnabled ? toMinor(v.extendedPrice) : null,
          compareAt: v.compareAtPrice ? toMinor(v.compareAtPrice) : null,
        },
        licenseTypes: { regular: true, extended: v.extendedEnabled, custom: v.customLicenseEnabled },
        supportDurationMonths: v.supportDurationMonths,
        licenseNotes: v.licenseNotes,
      };
    }
    case "seo": {
      const v = values as SeoValues;
      return { seo: { title: v.seoTitle, description: v.seoDescription, keywords: v.seoKeywords, canonicalUrl: v.canonicalUrl } };
    }
    case "content":
      return { ...(values as ContentValues) };
  }
  return {};
}

/** Saves one form section; `wizardStep` records progress for wizard drafts. */
export async function updateSection<K extends SectionKey>(
  id: string,
  section: K,
  values: SectionValues[K],
  actorId: string,
  wizardStep?: number,
): Promise<void> {
  const ref = products().doc(id);
  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new ProductError("Product not found.");
    if (section === "basic") await assertSlugFree(tx, (values as BasicValues).slug, id);

    const update: Record<string, unknown> = {
      ...sectionFields(section, values),
      updatedBy: actorId,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (wizardStep) {
      const wizard = snap.get("wizard") ?? { completedSteps: [], lastStep: 1 };
      update.wizard = {
        completedSteps: [...new Set([...(wizard.completedSteps ?? []), wizardStep])].sort((a, b) => a - b),
        lastStep: Math.max(wizard.lastStep ?? 1, wizardStep + 1),
      };
    }
    tx.update(ref, update);
  });
}

export async function markWizardStep(id: string, step: number, actorId: string) {
  const ref = products().doc(id);
  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new ProductError("Product not found.");
    const wizard = snap.get("wizard") ?? { completedSteps: [], lastStep: 1 };
    tx.update(ref, {
      wizard: {
        completedSteps: [...new Set([...(wizard.completedSteps ?? []), step])].sort((a, b) => a - b),
        lastStep: Math.max(wizard.lastStep ?? 1, step + 1),
      },
      updatedBy: actorId,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

export async function setStatus(id: string, status: ProductStatus, actorId: string): Promise<ProductStatus> {
  const ref = products().doc(id);
  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new ProductError("Product not found.");
    const product = toProductRecord(snap);
    if (status === "published") {
      const blockers = publishBlockers(product);
      if (blockers.length) throw new ProductError(`Complete these before publishing: ${blockers.join(", ")}.`);
    }
    tx.update(ref, {
      status,
      ...(status === "published" && !product.publishedAt ? { publishedAt: FieldValue.serverTimestamp() } : {}),
      ...(status !== "draft" ? { wizard: null } : {}),
      updatedBy: actorId,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return product.status;
  });
}

async function uniqueSlug(base: string): Promise<string> {
  for (let i = 1; i < 50; i++) {
    const candidate = i === 1 ? `${base}-copy` : `${base}-copy-${i}`;
    const clash = await products().where("slug", "==", candidate).limit(1).get();
    if (clash.empty) return candidate;
  }
  throw new ProductError("Could not find a free slug for the copy.");
}

/** Copies the product (as a draft) together with its media files. */
export async function duplicateProduct(id: string, actorId: string): Promise<string> {
  const source = await products().doc(id).get();
  if (!source.exists) throw new ProductError("Product not found.");
  const data = source.data()!;
  const ref = products().doc();
  const slug = await uniqueSlug(String(data.slug));

  const mediaSnap = await media().where("productId", "==", id).get();
  const bucket = adminStorage.bucket();
  const idMap = new Map<string, string>();
  const batch = adminDb.batch();
  for (const m of mediaSnap.docs) {
    const newRef = media().doc();
    const fromPath = String(m.get("storagePath"));
    const toPath = fromPath.replace(`products/${id}/`, `products/${ref.id}/`).replace(m.id, newRef.id);
    await bucket.file(fromPath).copy(bucket.file(toPath));
    idMap.set(m.id, newRef.id);
    batch.set(newRef, { ...m.data(), productId: ref.id, storagePath: toPath, createdAt: FieldValue.serverTimestamp(), uploadedBy: actorId });
  }

  batch.set(ref, {
    ...data,
    name: `${data.name} (copy)`,
    nameKey: slugify(`${data.name} copy`),
    slug,
    status: "draft",
    publishedAt: null,
    thumbnailMediaId: data.thumbnailMediaId ? (idMap.get(data.thumbnailMediaId) ?? null) : null,
    logoMediaId: data.logoMediaId ? (idMap.get(data.logoMediaId) ?? null) : null,
    source: { type: "manual", duplicatedFrom: id },
    wizard: null,
    createdBy: actorId,
    updatedBy: actorId,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();
  return ref.id;
}

/** Hard delete is only allowed while nothing commercial references the product. */
export async function deleteProduct(id: string): Promise<{ name: string; files: number }> {
  const snap = await products().doc(id).get();
  if (!snap.exists) throw new ProductError("Product not found.");

  const refs = await Promise.all(
    [COLLECTIONS.orders, COLLECTIONS.licenses, COLLECTIONS.productPackages, COLLECTIONS.productVersions].map(async (c) => ({
      collection: c,
      count: (await adminDb.collection(c).where("productId", "==", id).count().get()).data().count,
    })),
  );
  const used = refs.filter((r) => r.count > 0);
  if (used.length) {
    throw new ProductError(
      `This product has ${used.map((u) => `${u.count} ${u.collection}`).join(", ")}. Archive it instead of deleting.`,
    );
  }

  const mediaSnap = await media().where("productId", "==", id).get();
  const bucket = adminStorage.bucket();
  await Promise.all(mediaSnap.docs.map((m) => bucket.file(String(m.get("storagePath"))).delete({ ignoreNotFound: true })));
  const batch = adminDb.batch();
  mediaSnap.docs.forEach((m) => batch.delete(m.ref));
  batch.delete(snap.ref);
  await batch.commit();
  return { name: String(snap.get("name")), files: mediaSnap.size };
}

// ----- media records -----

export async function listProductMedia(productId: string): Promise<ProductMediaItem[]> {
  const snap = await media().where("productId", "==", productId).orderBy("order", "asc").get();
  return snap.docs.map((d) => {
    const m = d.data();
    return {
      id: d.id,
      kind: m.kind,
      alt: str(m.alt),
      section: m.section ?? null,
      order: Number(m.order ?? 0),
      contentType: str(m.contentType),
      size: Number(m.size ?? 0),
      width: m.width ?? null,
      height: m.height ?? null,
      createdAt: iso(m.createdAt),
    };
  });
}

// ----- lookups -----

export interface CategoryOption {
  id: string;
  name: string;
  slug: string;
}

export async function listCategoryOptions(): Promise<CategoryOption[]> {
  const snap = await adminDb.collection(COLLECTIONS.productCategories).orderBy("order", "asc").get();
  return snap.docs.map((d) => ({ id: d.id, name: str(d.get("name")), slug: str(d.get("slug")) }));
}

export interface MarketplaceOption {
  id: string;
  name: string;
}

export async function listMarketplaceOptions(): Promise<MarketplaceOption[]> {
  const snap = await adminDb.collection(COLLECTIONS.marketplaces).get();
  return snap.docs.map((d) => ({ id: d.id, name: str(d.get("name")) || d.id }));
}
