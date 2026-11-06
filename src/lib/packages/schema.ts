/** Source package & version model shared by client and server. */
import { z } from "zod";

export const PACKAGE_TYPES = [
  "complete_source",
  "customer_app",
  "delivery_app",
  "website",
  "admin_panel",
  "store_panel",
  "backend",
  "documentation",
  "module",
] as const;
export type PackageType = (typeof PACKAGE_TYPES)[number];

export const PACKAGE_TYPE_LABELS: Record<PackageType, string> = {
  complete_source: "Complete Source",
  customer_app: "Customer App",
  delivery_app: "Delivery App",
  website: "Next.js Website",
  admin_panel: "Admin Panel",
  store_panel: "Store Panel",
  backend: "Backend",
  documentation: "Documentation",
  module: "Individual Module",
};

export const PACKAGE_STATUSES = ["active", "replaced", "deleted"] as const;
export type PackageStatus = (typeof PACKAGE_STATUSES)[number];

export const VERSION_STATUSES = ["draft", "published", "deprecated"] as const;
export type VersionStatus = (typeof VERSION_STATUSES)[number];
export const VERSION_STATUS_LABELS: Record<VersionStatus, string> = {
  draft: "Draft",
  published: "Published",
  deprecated: "Deprecated",
};

export const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;

/** Compares x.y.z versions: negative when a < b. */
export function compareSemver(a: string, b: string): number {
  const pa = a.match(SEMVER_RE)?.slice(1).map(Number) ?? [0, 0, 0];
  const pb = b.match(SEMVER_RE)?.slice(1).map(Number) ?? [0, 0, 0];
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

const lines = z.array(z.string().trim().min(1).max(300)).max(100);

export const versionSchema = z.object({
  version: z.string().trim().regex(SEMVER_RE, "Use semantic versioning, e.g. 1.2.0."),
  releaseDate: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, "Pick a valid date."),
  title: z.string().trim().max(120),
  releaseNotes: z.string().trim().max(20_000),
  newFeatures: lines,
  improvements: lines,
  bugFixes: lines,
});
export type VersionValues = z.infer<typeof versionSchema>;

export interface VersionRecord {
  id: string;
  productId: string;
  version: string;
  status: VersionStatus;
  title: string;
  releaseDate: string;
  releaseNotes: string;
  newFeatures: string[];
  improvements: string[];
  bugFixes: string[];
  packageCount: number;
  packageBytes: number;
  createdAt: string | null;
  publishedAt: string | null;
  deprecatedAt: string | null;
}

export interface ZipSummary {
  entries: number;
  files: number;
  uncompressedBytes: number;
  topLevel: string[];
  sample: string[];
}

export interface PackageRecord {
  id: string;
  productId: string;
  versionId: string;
  version: string;
  packageType: PackageType;
  name: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  sha256: string;
  storagePath: string;
  releaseNotes: string;
  status: PackageStatus;
  zip: ZipSummary | null;
  replacesId: string | null;
  replacedById: string | null;
  uploadedBy: string;
  uploadedByEmail: string;
  createdAt: string | null;
}
