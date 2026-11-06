/** Marketplace submission (CodeCanyon) model shared by client and server. */
import { z } from "zod";

export const LISTING_STATUSES = ["draft", "ready", "submitted", "under_review", "approved", "rejected", "published"] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];
export const LISTING_STATUS_LABELS: Record<ListingStatus, string> = {
  draft: "Draft",
  ready: "Ready",
  submitted: "Submitted",
  under_review: "Under Review",
  approved: "Approved",
  rejected: "Rejected",
  published: "Published",
};

export const LISTING_NEXT: Record<ListingStatus, ListingStatus[]> = {
  draft: ["ready"],
  ready: ["draft", "submitted"],
  submitted: ["under_review", "approved", "rejected"],
  under_review: ["approved", "rejected"],
  approved: ["published"],
  rejected: ["draft"],
  published: [],
};

/** Manual checks staff confirm before submitting (CodeCanyon review expectations). */
export const MANUAL_CHECKS = [
  ["inline_preview", "590×300 inline preview image prepared"],
  ["thumbnail_80", "80×80 marketplace thumbnail prepared"],
  ["demo_working", "Live demo tested and working"],
  ["docs_in_package", "Documentation included in the download"],
  ["source_clean", "Package free of secrets, .env files, node_modules and build output"],
  ["third_party", "Third-party assets licensed and credited"],
  ["tested", "Tested on all supported platforms"],
] as const;
export type ManualCheck = (typeof MANUAL_CHECKS)[number][0];

export const listingSchema = z.object({
  itemTitle: z.string().trim().min(5, "Enter the item title.").max(100, "Marketplace titles are limited to 100 characters."),
  description: z.string().trim().max(30_000),
  category: z.string().trim().max(120),
  tags: z.array(z.string().trim().min(1).max(40)).max(15, "Marketplaces allow at most 15 tags."),
  versionId: z.string().max(128),
  liveDemoUrl: z.string().trim().max(500).refine((v) => v === "" || /^https:\/\/\S+$/.test(v), "Use an https:// URL."),
  sourcePackageId: z.string().max(128),
  documentationPackageId: z.string().max(128),
  thumbnailMediaId: z.string().max(128),
  screenshotMediaIds: z.array(z.string().max(128)).max(50),
  changelog: z.string().trim().max(20_000),
  requirements: z.string().trim().max(5000),
  checklist: z.record(z.string(), z.boolean()),
});
export type ListingValues = z.infer<typeof listingSchema>;

export interface ListingRecord extends ListingValues {
  id: string;
  productId: string;
  marketplaceId: string;
  status: ListingStatus;
  rejectionNotes: string;
  resubmissions: number;
  itemId: string;
  itemUrl: string;
  history: { status: ListingStatus; note: string; byEmail: string; at: string | null }[];
  updatedAt: string | null;
  createdAt: string | null;
}

export interface AutoCheck {
  key: string;
  label: string;
  ok: boolean;
}

export function autoChecks(l: ListingValues): AutoCheck[] {
  return [
    { key: "title", label: "Title set (≤ 100 characters)", ok: l.itemTitle.length >= 5 && l.itemTitle.length <= 100 },
    { key: "description", label: "Description written", ok: l.description.length >= 200 },
    { key: "tags", label: "Tags added (up to 15)", ok: l.tags.length > 0 },
    { key: "version", label: "Item version selected", ok: !!l.versionId },
    { key: "source", label: "Source code ZIP selected", ok: !!l.sourcePackageId },
    { key: "documentation", label: "Documentation selected", ok: !!l.documentationPackageId },
    { key: "thumbnail", label: "Thumbnail / preview image selected", ok: !!l.thumbnailMediaId },
    { key: "screenshots", label: "Screenshots selected", ok: l.screenshotMediaIds.length > 0 },
    { key: "demo", label: "Live demo URL", ok: !!l.liveDemoUrl },
    { key: "changelog", label: "Changelog", ok: !!l.changelog },
    { key: "requirements", label: "Requirements", ok: !!l.requirements },
  ];
}

export function readiness(l: ListingValues) {
  const auto = autoChecks(l);
  const manual = MANUAL_CHECKS.map(([key, label]) => ({ key, label, ok: !!l.checklist[key] }));
  const all = [...auto, ...manual];
  return { auto, manual, done: all.filter((c) => c.ok).length, total: all.length, ready: all.every((c) => c.ok) };
}
