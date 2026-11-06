import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { DomainError } from "@/lib/actions";
import { adminDb, adminStorage } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { getUploadSettings, listPackages, toPackage } from "@/lib/packages/service";
import type { PackageRecord } from "@/lib/packages/schema";
import { listLicenses } from "@/lib/sales/service";

export type DenyReason = "no_customer" | "customer_suspended" | "package_unavailable" | "version_unreleased" | "no_license" | "license_inactive";

export const DENY_MESSAGES: Record<DenyReason, string> = {
  no_customer: "No customer account is linked to this login.",
  customer_suspended: "This customer account is suspended.",
  package_unavailable: "This package is no longer available.",
  version_unreleased: "This version hasn't been released yet.",
  no_license: "No license for this product was found for this customer.",
  license_inactive: "The license for this product is revoked or refunded.",
};

export type Entitlement = { allowed: true; licenseId: string; pkg: PackageRecord } | { allowed: false; reason: DenyReason };

/**
 * Download entitlement: an active customer, an active license for the package's
 * product, and a package that belongs to a released (published or deprecated) version.
 * Licenses carry `entitlement.versions = "all"` (lifetime updates); this is the single
 * place to add version-specific rules.
 */
export async function checkEntitlement(customerId: string, packageId: string): Promise<Entitlement> {
  const [customer, pkgSnap] = await Promise.all([
    adminDb.collection(COLLECTIONS.customers).doc(customerId).get(),
    adminDb.collection(COLLECTIONS.productPackages).doc(packageId).get(),
  ]);
  if (!customer.exists) return { allowed: false, reason: "no_customer" };
  if (customer.get("status") !== "active") return { allowed: false, reason: "customer_suspended" };
  if (!pkgSnap.exists || pkgSnap.get("status") !== "active") return { allowed: false, reason: "package_unavailable" };

  const version = await adminDb.collection(COLLECTIONS.productVersions).doc(pkgSnap.get("versionId")).get();
  if (!version.exists || version.get("status") === "draft") return { allowed: false, reason: "version_unreleased" };

  // Never trust a productId from the caller: it comes from the package record.
  const licenses = await adminDb
    .collection(COLLECTIONS.licenses)
    .where("customerId", "==", customerId)
    .where("productId", "==", pkgSnap.get("productId"))
    .get();
  if (licenses.empty) return { allowed: false, reason: "no_license" };
  const active = licenses.docs.find((l) => l.get("status") === "active");
  if (!active) return { allowed: false, reason: "license_inactive" };

  return { allowed: true, licenseId: active.id, pkg: toPackage(pkgSnap) };
}

/** Packages a customer may download right now, grouped by product. */
export async function entitledPackages(customerId: string) {
  const licenses = (await listLicenses({ customerId })).filter((l) => l.status === "active");
  const productIds = [...new Set(licenses.map((l) => l.productId))];
  const [packages, versions] = await Promise.all([
    Promise.all(productIds.map((productId) => listPackages({ productId }))).then((x) => x.flat()),
    adminDb.collection(COLLECTIONS.productVersions).where("status", "in", ["published", "deprecated"]).select("productId").get(),
  ]);
  const released = new Set(versions.docs.map((v) => v.id));
  return packages.filter((p) => released.has(p.versionId));
}

export async function issueDownload(input: {
  customerId: string;
  packageId: string;
  issuedBy: { type: "customer" } | { type: "staff"; uid: string; email: string };
  ip: string | null;
  userAgent: string | null;
}) {
  const entitlement = await checkEntitlement(input.customerId, input.packageId);
  if (!entitlement.allowed) {
    await adminDb.collection(COLLECTIONS.downloadLogs).add({
      customerId: input.customerId,
      packageId: input.packageId,
      result: "denied",
      reason: entitlement.reason,
      issuedBy: input.issuedBy.type === "staff" ? input.issuedBy.uid : "customer",
      ip: input.ip,
      createdAt: FieldValue.serverTimestamp(),
    });
    throw new DomainError(DENY_MESSAGES[entitlement.reason]);
  }
  const { pkg, licenseId } = entitlement;
  const { signedUrlTtlMinutes } = await getUploadSettings();
  const expires = Date.now() + signedUrlTtlMinutes * 60 * 1000;
  const [url] = await adminStorage.bucket().file(pkg.storagePath).getSignedUrl({
    version: "v4",
    action: "read",
    expires,
    responseDisposition: `attachment; filename="${pkg.fileName.replace(/["\\\r\n]/g, "_")}"`,
  });
  await adminDb.collection(COLLECTIONS.downloadLogs).add({
    customerId: input.customerId,
    productId: pkg.productId,
    packageId: pkg.id,
    versionId: pkg.versionId,
    version: pkg.version,
    fileName: pkg.fileName,
    licenseId,
    result: "authorized",
    issuedBy: input.issuedBy.type === "staff" ? input.issuedBy.uid : "customer",
    issuedByEmail: input.issuedBy.type === "staff" ? input.issuedBy.email : null,
    ip: input.ip,
    userAgent: input.userAgent,
    expiresAt: Timestamp.fromMillis(expires),
    createdAt: FieldValue.serverTimestamp(),
  });
  return { url, expiresInMinutes: signedUrlTtlMinutes, pkg };
}

export interface DownloadLog {
  id: string;
  customerId: string;
  productId: string | null;
  packageId: string;
  fileName: string | null;
  version: string | null;
  result: "authorized" | "denied";
  reason: string | null;
  issuedBy: string;
  issuedByEmail: string | null;
  ip: string | null;
  createdAt: string | null;
}

export async function listDownloadLogs(filter: { customerId?: string } = {}, limit = 1000): Promise<DownloadLog[]> {
  const base = adminDb.collection(COLLECTIONS.downloadLogs);
  const snap = filter.customerId ? await base.where("customerId", "==", filter.customerId).limit(limit).get() : await base.orderBy("createdAt", "desc").limit(limit).get();
  return snap.docs
    .map((d) => ({
      id: d.id,
      customerId: String(d.get("customerId") ?? ""),
      productId: d.get("productId") ?? null,
      packageId: String(d.get("packageId") ?? ""),
      fileName: d.get("fileName") ?? null,
      version: d.get("version") ?? null,
      result: d.get("result") === "denied" ? ("denied" as const) : ("authorized" as const),
      reason: d.get("reason") ?? null,
      issuedBy: String(d.get("issuedBy") ?? ""),
      issuedByEmail: d.get("issuedByEmail") ?? null,
      ip: d.get("ip") ?? null,
      createdAt: d.get("createdAt") instanceof Timestamp ? d.get("createdAt").toDate().toISOString() : null,
    }))
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}
