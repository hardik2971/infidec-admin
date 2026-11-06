/**
 * Product model shared by the wizard, edit forms and server actions.
 * Each form section has its own schema so it can be saved independently
 * (wizard steps and edit-page tabs reuse the same sections).
 *
 * Money is stored in minor units (paise / cents) — forms work in major units.
 */
import { z } from "zod";

export const PRODUCT_STATUSES = ["draft", "in_review", "published", "suspended", "archived"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const STATUS_LABELS: Record<ProductStatus, string> = {
  draft: "Draft",
  in_review: "In Review",
  published: "Published",
  suspended: "Suspended",
  archived: "Archived",
};

export const PRODUCT_TYPES = ["app", "addon", "theme", "plugin", "script", "other"] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];
export const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  app: "Application",
  addon: "Add-on",
  theme: "Theme / UI Kit",
  plugin: "Plugin",
  script: "Script",
  other: "Other",
};

export const CURRENCIES = ["INR", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const MEDIA_KINDS = ["logo", "thumbnail", "screenshot"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

const optionalUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === "" || /^https?:\/\/\S+$/i.test(v), "Enter a full URL starting with https://");

const tagList = (max: number, label: string) =>
  z.array(z.string().trim().min(1).max(80)).max(max, `Up to ${max} ${label}.`);

const card = z.object({ title: z.string().trim().min(1).max(120), text: z.string().trim().max(600) });

// ----- sections -----

export const basicSchema = z.object({
  name: z.string().trim().min(2, "Enter the product name.").max(80),
  slug: z
    .string()
    .trim()
    .min(2, "Enter a URL slug.")
    .max(96)
    .regex(SLUG_RE, "Use lowercase letters, numbers and single hyphens."),
  title: z.string().trim().max(160),
  tagline: z.string().trim().max(120),
  categoryId: z.string().trim().min(1, "Choose a category."),
  productType: z.enum(PRODUCT_TYPES),
  shortDescription: z.string().trim().min(10, "Write a short description (10+ characters).").max(400),
  fullDescription: z.string().trim().max(20_000),
  version: z
    .string()
    .trim()
    .regex(/^\d+\.\d+\.\d+$/, "Use semantic versioning, e.g. 1.0.0."),
  releaseDate: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, "Pick a valid date."),
  platform: z.string().trim().max(80),
  techStack: tagList(30, "technologies"),
  integrations: tagList(40, "integrations"),
  modules: tagList(30, "modules"),
  demoUrl: optionalUrl,
  websiteUrl: optionalUrl,
});
export type BasicValues = z.infer<typeof basicSchema>;

export const marketplaceSchema = z.object({
  marketplaceId: z.string().trim().max(64),
  marketplaceItemId: z.string().trim().max(64),
  marketplaceUrl: optionalUrl,
});
export type MarketplaceValues = z.infer<typeof marketplaceSchema>;

const money = z
  .number({ error: "Enter a price." })
  .min(0, "Price can't be negative.")
  .max(100_000_000);

export const licenseSchema = z
  .object({
    currency: z.enum(CURRENCIES),
    regularPrice: money,
    extendedEnabled: z.boolean(),
    extendedPrice: money.nullable(),
    compareAtPrice: money.nullable(),
    customLicenseEnabled: z.boolean(),
    supportDurationMonths: z.number().int().min(0).max(60),
    licenseNotes: z.string().trim().max(2000),
  })
  .refine((v) => !v.extendedEnabled || (v.extendedPrice !== null && v.extendedPrice > 0), {
    path: ["extendedPrice"],
    message: "Enter the extended licence price.",
  })
  .refine((v) => v.compareAtPrice === null || v.compareAtPrice === 0 || v.compareAtPrice > v.regularPrice, {
    path: ["compareAtPrice"],
    message: "The original price should be higher than the regular price.",
  });
export type LicenseValues = z.infer<typeof licenseSchema>;

export const seoSchema = z.object({
  seoTitle: z.string().trim().max(70, "Keep the SEO title under 70 characters."),
  seoDescription: z.string().trim().max(170, "Keep the meta description under 170 characters."),
  seoKeywords: tagList(20, "keywords"),
  canonicalUrl: optionalUrl,
});
export type SeoValues = z.infer<typeof seoSchema>;

export const contentSchema = z.object({
  features: z
    .array(z.object({ title: z.string().trim().min(1).max(120), subtitle: z.string().trim().max(200).nullable(), items: z.array(card).max(40) }))
    .max(20),
  requirements: z.array(card).max(20),
  whatYouGet: tagList(40, "items"),
});
export type ContentValues = z.infer<typeof contentSchema>;

export const SECTION_SCHEMAS = {
  basic: basicSchema,
  marketplace: marketplaceSchema,
  license: licenseSchema,
  seo: seoSchema,
  content: contentSchema,
} as const;
export type SectionKey = keyof typeof SECTION_SCHEMAS;

// ----- stored document (serialised for the client) -----

export interface ProductMediaItem {
  id: string;
  kind: MediaKind;
  alt: string;
  section: string | null;
  order: number;
  contentType: string;
  size: number;
  width: number | null;
  height: number | null;
  createdAt: string | null;
}

export interface ProductRecord {
  id: string;
  status: ProductStatus;
  name: string;
  slug: string;
  title: string;
  tagline: string;
  categoryId: string;
  productType: ProductType;
  shortDescription: string;
  fullDescription: string;
  version: string;
  releaseDate: string;
  platform: string;
  techStack: string[];
  integrations: string[];
  modules: string[];
  demoUrl: string;
  demoLinks: { label: string; url: string }[];
  websiteUrl: string;
  marketplaceId: string;
  marketplaceItemId: string;
  marketplaceUrl: string;
  pricing: {
    currency: Currency;
    regular: number; // minor units
    extended: number | null;
    compareAt: number | null;
  };
  licenseTypes: { regular: boolean; extended: boolean; custom: boolean };
  supportDurationMonths: number;
  licenseNotes: string;
  seo: { title: string; description: string; keywords: string[]; canonicalUrl: string };
  features: ContentValues["features"];
  requirements: ContentValues["requirements"];
  whatYouGet: string[];
  thumbnailMediaId: string | null;
  logoMediaId: string | null;
  source: { type: "manual" | "website-import"; url?: string; sourceSlug?: string; commit?: string | null; importedAt?: string } | null;
  wizard: { completedSteps: number[]; lastStep: number } | null;
  createdAt: string | null;
  updatedAt: string | null;
  publishedAt: string | null;
}

/** Fields a product needs before it can be published. */
export function publishBlockers(p: ProductRecord): string[] {
  const issues: string[] = [];
  if (!p.name) issues.push("Product name");
  if (!p.categoryId) issues.push("Category");
  if (p.shortDescription.length < 10) issues.push("Short description");
  if (!p.fullDescription) issues.push("Full description");
  if (!p.thumbnailMediaId) issues.push("Thumbnail image");
  if (!(p.pricing.regular > 0)) issues.push("Regular licence price");
  if (!p.seo.title) issues.push("SEO title");
  if (!p.seo.description) issues.push("SEO description");
  return issues;
}

// ----- form defaults (stored record → form values; money back to major units) -----

const toMajor = (minor: number | null) => (minor === null ? null : minor / 100);

export function basicDefaults(p?: ProductRecord | null): BasicValues {
  return {
    name: p?.name ?? "",
    slug: p?.slug ?? "",
    title: p?.title ?? "",
    tagline: p?.tagline ?? "",
    categoryId: p?.categoryId ?? "",
    productType: p?.productType ?? "app",
    shortDescription: p?.shortDescription ?? "",
    fullDescription: p?.fullDescription ?? "",
    version: p?.version ?? "1.0.0",
    releaseDate: p?.releaseDate ?? "",
    platform: p?.platform ?? "",
    techStack: p?.techStack ?? [],
    integrations: p?.integrations ?? [],
    modules: p?.modules ?? [],
    demoUrl: p?.demoUrl ?? "",
    websiteUrl: p?.websiteUrl ?? "",
  };
}

export function marketplaceDefaults(p: ProductRecord): MarketplaceValues {
  return { marketplaceId: p.marketplaceId, marketplaceItemId: p.marketplaceItemId, marketplaceUrl: p.marketplaceUrl };
}

export function licenseDefaults(p: ProductRecord): LicenseValues {
  return {
    currency: p.pricing.currency,
    regularPrice: toMajor(p.pricing.regular) ?? 0,
    extendedEnabled: p.licenseTypes.extended,
    extendedPrice: toMajor(p.pricing.extended),
    compareAtPrice: toMajor(p.pricing.compareAt),
    customLicenseEnabled: p.licenseTypes.custom,
    supportDurationMonths: p.supportDurationMonths,
    licenseNotes: p.licenseNotes,
  };
}

export function seoDefaults(p: ProductRecord): SeoValues {
  return { seoTitle: p.seo.title, seoDescription: p.seo.description, seoKeywords: p.seo.keywords, canonicalUrl: p.seo.canonicalUrl };
}

export function contentDefaults(p: ProductRecord): ContentValues {
  return { features: p.features, requirements: p.requirements, whatYouGet: p.whatYouGet };
}
