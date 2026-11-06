/**
 * Extracts the product catalogue from the INFIDEC website source (the code behind
 * https://infidec.com/products) into data/website-catalog.json.
 *
 *   node scripts/extract-website-catalog.mts [path-to-infidec-marketplace]
 *
 * The snapshot is what the admin's Import page previews and imports, so the deployed
 * admin never needs the website repository. Only facts present on the product pages
 * are captured. Display-only marketing numbers (`rating`, `sales`) are deliberately
 * excluded: they are not verified marketplace data.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const WEBSITE_URL = "https://infidec.com";
const sourceDir = path.resolve(process.argv[2] ?? "../infidec-marketplace");
const dataDir = path.join(sourceDir, "src", "data");
if (!existsSync(path.join(dataDir, "products.ts"))) {
  console.error(`Not an infidec-marketplace checkout: ${sourceDir}`);
  process.exit(1);
}

type Card = { title: string; text: string };

const load = (file: string) => import(pathToFileURL(path.join(dataDir, file)).href);
const catalogue = await load("products.ts");

/** dd-MM-yyyy (as written on the site) → yyyy-MM-dd */
function isoDate(value: string | undefined): string | null {
  const m = value?.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** The website's own extended-licence formula (src/lib/pricing.ts → extendedPriceOf). */
const extendedPriceOf = (price: number) => Math.round((price * 41.6) / 100) * 100 - 1;

let sourceCommit: string | null = null;
try {
  sourceCommit = execFileSync("git", ["-C", sourceDir, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
} catch {
  // not a git checkout
}

// Each product module exports `<name>Product` and `<name>Content` side by side.
// Modules that need the website's bundler (path aliases, JSX) fail to load and are skipped.
const dataModules: Record<string, unknown>[] = [];
for (const file of readdirSync(dataDir).filter((f) => f.endsWith(".ts"))) {
  try {
    dataModules.push(await load(file));
  } catch {
    // not a plain data module
  }
}

interface CatalogProduct {
  name: string;
  version: string;
  productUrl: string;
  pricing: { currency: string; regular: number; extended: number; compareAt: number | null };
  media: { thumbnail: { url: string; alt: string } | null; screenshots: { url: string; alt: string; section: string }[] };
  [key: string]: unknown;
}
const products: CatalogProduct[] = [];
for (const p of catalogue.products) {
  const mod = dataModules.find((m) => Object.values(m).some((v) => (v as { slug?: string })?.slug === p.slug && v !== undefined && "price" in (v as object)));
  const content = mod
    ? (Object.values(mod).find((v) => Array.isArray((v as { overview?: unknown })?.overview)) as Record<string, unknown> | undefined)
    : undefined;
  if (!content) {
    console.warn(`! no page content found for ${p.slug} — skipped`);
    continue;
  }

  const c = content as {
    overview: string[];
    features?: { title: string; subtitle?: string; items: Card[] }[];
    requirements: Card[];
    youGet: string[];
    demoLinks?: { label: string; href: string }[];
    docsUrl?: string;
    changelogUrl?: string;
    showcase?: { id: string; label: string; title: string; images: { src: string; alt: string; width: number; height: number }[] }[];
  };

  // SEO exactly as the product page computes it (src/app/products/[slug]/page.tsx → generateMetadata).
  const seoTitle = p.title.length > 60 ? `${p.name} – ${p.tagline}` : p.title;
  const seoDescription = `${p.summary} Price ₹${p.price.toLocaleString("en-IN")}. Lifetime updates & support.`.slice(0, 160);

  products.push({
    sourceSlug: p.slug,
    name: p.name,
    title: p.title,
    tagline: p.tagline,
    productType: p.type,
    categoryKey: p.category,
    shortDescription: p.summary,
    fullDescription: c.overview.join("\n\n"),
    productUrl: `${WEBSITE_URL}/products/${p.slug}`,
    version: p.version,
    releaseDate: isoDate(p.releaseDate),
    lastUpdate: isoDate(p.lastUpdate),
    platform: p.platform,
    techStack: p.techStack,
    integrations: p.integrations,
    modules: p.chips,
    features: (c.features ?? []).map((f) => ({ title: f.title, subtitle: f.subtitle ?? null, items: f.items })),
    requirements: c.requirements,
    whatYouGet: c.youGet,
    demoLinks: (c.demoLinks ?? []).map((d) => ({ label: d.label, url: d.href })),
    docsUrl: c.docsUrl ? `${WEBSITE_URL}${c.docsUrl}` : null,
    changelogUrl: c.changelogUrl ? `${WEBSITE_URL}${c.changelogUrl}` : null,
    pricing: {
      currency: "INR",
      regular: p.price,
      extended: extendedPriceOf(p.price),
      compareAt: p.oldPrice ?? null,
    },
    seo: { title: seoTitle, description: seoDescription, canonicalUrl: `${WEBSITE_URL}/products/${p.slug}` },
    media: {
      thumbnail: p.image ? { url: `${WEBSITE_URL}${p.image}`, alt: `${p.name} – ${p.tagline}` } : null,
      screenshots: (c.showcase ?? []).flatMap((section) =>
        section.images.map((img) => ({ url: `${WEBSITE_URL}${img.src}`, alt: img.alt, section: section.label })),
      ),
    },
  });
}

/**
 * The live product pages are the source of truth: confirm the extracted facts
 * appear on each page so a stale local checkout can't import outdated data.
 * (Version and release date are not shown on the live pages; they come from the source only.)
 */
async function verifyAgainstLive(p: CatalogProduct) {
  const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;
  try {
    const res = await fetch(p.productUrl, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return { checkedAt: new Date().toISOString(), ok: false, mismatches: [`Page returned HTTP ${res.status}`] };
    const text = (await res.text()).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
    const expectations: [string, string][] = [
      ["name", p.name],
      ["regular price", rupees(p.pricing.regular)],
      ["extended price", rupees(p.pricing.extended)],
      ...(p.pricing.compareAt ? ([["original price", rupees(p.pricing.compareAt)]] as [string, string][]) : []),
    ];
    const mismatches = expectations
      .filter(([, value]) => !text.includes(value))
      .map(([label, value]) => `${label} "${value}" not found on the live page`);
    return { checkedAt: new Date().toISOString(), ok: mismatches.length === 0, mismatches };
  } catch (error) {
    return { checkedAt: new Date().toISOString(), ok: false, mismatches: [`Live page unreachable: ${(error as Error).message}`] };
  }
}

const verified = await Promise.all(products.map(async (p) => ({ ...p, liveVerification: await verifyAgainstLive(p) })));
products.splice(0, products.length, ...verified);

const snapshot = {
  source: {
    website: WEBSITE_URL,
    repository: "infidec-marketplace",
    commit: sourceCommit,
    extractedAt: new Date().toISOString(),
  },
  categories: catalogue.categories.map((c: { key: string; label: string }) => ({ key: c.key, label: c.label })),
  products,
};

const outDir = path.join(process.cwd(), "data");
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, "website-catalog.json"), JSON.stringify(snapshot, null, 2) + "\n");
console.log(`✔ ${products.length} products, ${snapshot.categories.length} categories → data/website-catalog.json`);
console.log(`  source commit: ${sourceCommit ?? "unknown"}`);
for (const p of products) {
  const v = (p as { liveVerification?: { ok: boolean; mismatches: string[] } }).liveVerification;
  console.log(`  • ${p.name.padEnd(14)} v${p.version}  ₹${p.pricing.regular} / ₹${p.pricing.extended}  ${p.media.screenshots.length} screenshots  live: ${v?.ok ? "verified" : `MISMATCH ${v?.mismatches.join("; ")}`}`);
}
