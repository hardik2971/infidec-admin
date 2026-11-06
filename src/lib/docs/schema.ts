/** Documentation CMS model shared by client and server. */
import { z } from "zod";
import { SLUG_RE } from "@/lib/products/schema";

export const DOC_KINDS = ["section", "page"] as const;
export type DocKind = (typeof DOC_KINDS)[number];

export const DOC_STATUSES = ["draft", "published"] as const;
export type DocStatus = (typeof DOC_STATUSES)[number];

/** Video tutorials may only embed from these hosts. */
export const VIDEO_HOSTS = ["www.youtube.com", "youtube.com", "youtu.be", "player.vimeo.com", "vimeo.com", "www.loom.com"];

export function videoEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || !VIDEO_HOSTS.includes(u.hostname)) return null;
    if (u.hostname === "youtu.be") return `https://www.youtube-nocookie.com/embed/${u.pathname.slice(1)}`;
    if (u.hostname.endsWith("youtube.com")) {
      const id = u.searchParams.get("v") ?? u.pathname.split("/embed/")[1];
      return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
    }
    if (u.hostname === "vimeo.com") return `https://player.vimeo.com/video/${u.pathname.split("/").filter(Boolean)[0]}`;
    if (u.hostname === "www.loom.com") return url.replace("/share/", "/embed/");
    return url;
  } catch {
    return null;
  }
}

export const docSchema = z.object({
  title: z.string().trim().min(2, "Enter a title.").max(140),
  slug: z.string().trim().min(1).max(96).regex(SLUG_RE, "Use lowercase letters, numbers and single hyphens."),
  content: z.string().max(200_000, "This page is too long — split it into several pages."),
  videoUrl: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === "" || videoEmbedUrl(v) !== null, "Use a YouTube, Vimeo or Loom https link."),
  summary: z.string().trim().max(300),
});
export type DocValues = z.infer<typeof docSchema>;

export interface DocAttachment {
  id: string;
  fileName: string;
  contentType: string;
  size: number;
  storagePath: string;
  uploadedAt: string | null;
}

export interface DocRecord {
  id: string;
  productId: string;
  kind: DocKind;
  parentId: string | null;
  order: number;
  status: DocStatus;
  title: string;
  slug: string;
  summary: string;
  content: string;
  videoUrl: string;
  attachments: DocAttachment[];
  revision: number;
  updatedAt: string | null;
  updatedByEmail: string;
  publishedAt: string | null;
}

export interface DocRevision {
  id: string;
  revision: number;
  title: string;
  content: string;
  savedAt: string | null;
  savedByEmail: string;
}

/** The standard outline from the platform specification, created on demand per product. */
export const STANDARD_OUTLINE: { title: string; pages: string[] }[] = [
  { title: "Getting Started", pages: ["Introduction", "Features", "Requirements", "Product Overview", "System Architecture"] },
  {
    title: "Installation",
    pages: [
      "Firebase Setup",
      "Authentication Setup",
      "Firestore Setup",
      "Storage Setup",
      "Cloud Functions Setup",
      "Flutter Setup",
      "Next.js Setup",
      "Admin Panel Setup",
      "Environment Variables",
      "Production Deployment",
    ],
  },
  {
    title: "Configuration",
    pages: ["Branding", "Logo", "Colors", "Currency", "Languages", "Payment Gateways", "SMTP", "SMS", "Notifications", "Maps", "Delivery Zones"],
  },
  {
    title: "Modules",
    pages: ["Customer App", "Delivery Boy App", "Website", "Super Admin", "Store Panel", "Delivery Panel", "Orders", "Inventory", "Payments", "Wallet", "Refunds", "Coupons", "Returns"],
  },
  {
    title: "Developer Documentation",
    pages: ["Architecture", "Database Collections", "Security Rules", "API Documentation", "Cloud Functions", "Authentication", "Third-party Integrations"],
  },
];

/** Builds a parent → children tree ordered by `order`. */
export function buildTree<T extends { id: string; parentId: string | null; order: number }>(docs: T[]) {
  const byParent = new Map<string | null, T[]>();
  for (const d of docs) {
    const list = byParent.get(d.parentId) ?? [];
    list.push(d);
    byParent.set(d.parentId, list);
  }
  for (const list of byParent.values()) list.sort((a, b) => a.order - b.order);
  return byParent;
}
