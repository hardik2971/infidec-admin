import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { FieldValue, Timestamp, type DocumentSnapshot } from "firebase-admin/firestore";
import { adminAuth, adminDb, adminStorage } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { ProductError } from "@/lib/products/service";
import { slugify } from "@/lib/products/schema";
import { PACKAGE_TYPE_LABELS, type PackageRecord, type PackageStatus, type PackageType } from "./schema";
import { inspectZip, ZipValidationError } from "./zip";

const packages = () => adminDb.collection(COLLECTIONS.productPackages);
const sessions = () => adminDb.collection(COLLECTIONS.uploadSessions);
const iso = (v: unknown) => (v instanceof Timestamp ? v.toDate().toISOString() : null);

/** Hard ceiling enforced by storage.rules for the staging path. */
export const STORAGE_RULES_MAX_MB = 2048;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export async function getUploadSettings() {
  const s = (await adminDb.collection(COLLECTIONS.systemSettings).doc("general").get()).data() ?? {};
  const maxUploadSizeMb = Math.min(Number(s.maxUploadSizeMb ?? STORAGE_RULES_MAX_MB), STORAGE_RULES_MAX_MB);
  return {
    maxUploadSizeMb,
    maxUploadBytes: maxUploadSizeMb * 1024 * 1024,
    signedUrlTtlMinutes: Math.min(Math.max(Number(s.signedUrlTtlMinutes ?? 15), 1), 60),
  };
}

export function toPackage(snap: DocumentSnapshot): PackageRecord {
  const d = snap.data() ?? {};
  return {
    id: snap.id,
    productId: String(d.productId ?? ""),
    versionId: String(d.versionId ?? ""),
    version: String(d.version ?? ""),
    packageType: d.packageType,
    name: String(d.name ?? ""),
    fileName: String(d.fileName ?? ""),
    fileSize: Number(d.fileSize ?? 0),
    fileType: String(d.fileType ?? "application/zip"),
    sha256: String(d.sha256 ?? ""),
    storagePath: String(d.storagePath ?? ""),
    releaseNotes: String(d.releaseNotes ?? ""),
    status: (d.status ?? "active") as PackageStatus,
    zip: d.zip ?? null,
    replacesId: d.replacesId ?? null,
    replacedById: d.replacedById ?? null,
    uploadedBy: String(d.uploadedBy ?? ""),
    uploadedByEmail: String(d.uploadedByEmail ?? ""),
    createdAt: iso(d.createdAt),
  };
}

export async function listPackages(filter: { productId?: string; versionId?: string; includeHistory?: boolean } = {}) {
  let q = packages().where("status", "in", filter.includeHistory ? ["active", "replaced", "deleted"] : ["active"]);
  if (filter.productId) q = q.where("productId", "==", filter.productId);
  if (filter.versionId) q = q.where("versionId", "==", filter.versionId);
  const snap = await q.limit(2000).get();
  return snap.docs.map(toPackage).sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

export async function getPackage(id: string) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return null;
  const snap = await packages().doc(id).get();
  return snap.exists ? toPackage(snap) : null;
}

// ----- upload: init -----

export interface InitUploadInput {
  productId: string;
  versionId: string;
  packageType: PackageType;
  name: string;
  releaseNotes: string;
  fileName: string;
  fileSize: number;
  replacesId?: string | null;
}

/**
 * Registers an upload and returns a short-lived staff token. The browser uploads
 * directly to uploads/staging/{uid}/{uploadId}/ (allowed by storage.rules only for
 * that staff member), then calls completeUpload for server-side validation.
 */
export async function initUpload(input: InitUploadInput, actor: { uid: string; roleId: string }) {
  if (!/\.zip$/i.test(input.fileName)) throw new ProductError("Only .zip files can be uploaded as source packages.");
  const { maxUploadBytes, maxUploadSizeMb } = await getUploadSettings();
  if (input.fileSize <= 0) throw new ProductError("The file is empty.");
  if (input.fileSize > maxUploadBytes) throw new ProductError(`Packages are limited to ${maxUploadSizeMb} MB.`);

  const [product, version] = await Promise.all([
    adminDb.collection(COLLECTIONS.products).doc(input.productId).get(),
    adminDb.collection(COLLECTIONS.productVersions).doc(input.versionId).get(),
  ]);
  if (!product.exists) throw new ProductError("Product not found.");
  if (!version.exists || version.get("productId") !== input.productId) {
    throw new ProductError("That version does not belong to this product.");
  }
  if (version.get("status") === "deprecated") throw new ProductError("Deprecated versions can't receive new packages.");

  if (input.replacesId) {
    const old = await packages().doc(input.replacesId).get();
    if (!old.exists || old.get("productId") !== input.productId || old.get("status") !== "active") {
      throw new ProductError("The package being replaced is not an active package of this product.");
    }
  }

  const uploadId = randomUUID();
  const safeName = `${slugify(input.fileName.replace(/\.zip$/i, "")) || "package"}.zip`;
  const stagingPath = `uploads/staging/${actor.uid}/${uploadId}/${safeName}`;
  await sessions().doc(uploadId).set({
    uid: actor.uid,
    ...input,
    replacesId: input.replacesId ?? null,
    stagingPath,
    status: "pending",
    createdAt: FieldValue.serverTimestamp(),
  });
  const token = await adminAuth.createCustomToken(actor.uid, { staff: true, role: actor.roleId });
  return { uploadId, stagingPath, token };
}

// ----- upload: complete -----

async function sha256Of(file: ReturnType<ReturnType<typeof adminStorage.bucket>["file"]>) {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    file
      .createReadStream({ validation: false })
      .on("data", (chunk) => hash.update(chunk))
      .on("end", resolve)
      .on("error", reject);
  });
  return hash.digest("hex");
}

export async function completeUpload(uploadId: string, actor: { uid: string; email: string }): Promise<PackageRecord> {
  const sessionRef = sessions().doc(uploadId);
  const session = await sessionRef.get();
  if (!session.exists || session.get("uid") !== actor.uid) throw new ProductError("Upload not found.");
  if (session.get("status") !== "pending") throw new ProductError("This upload was already processed.");
  const createdAt = session.get("createdAt") as Timestamp | undefined;
  if (createdAt && Date.now() - createdAt.toMillis() > SESSION_TTL_MS) throw new ProductError("This upload has expired. Please upload again.");

  const s = session.data()!;
  const bucket = adminStorage.bucket();
  const staged = bucket.file(String(s.stagingPath));

  const fail = async (message: string): Promise<never> => {
    await staged.delete({ ignoreNotFound: true });
    await sessionRef.update({ status: "failed", error: message, finishedAt: FieldValue.serverTimestamp() });
    throw new ProductError(message);
  };

  const [exists] = await staged.exists();
  if (!exists) return fail("The uploaded file was not found in staging. Please upload again.");
  const [meta] = await staged.getMetadata();
  const size = Number(meta.size ?? 0);
  const { maxUploadBytes, maxUploadSizeMb } = await getUploadSettings();
  if (size !== Number(s.fileSize)) return fail("The uploaded file is incomplete. Please upload again.");
  if (size > maxUploadBytes) return fail(`Packages are limited to ${maxUploadSizeMb} MB.`);

  let report;
  try {
    report = await inspectZip(async (start, end) => (await staged.download({ start, end, validation: false }))[0], size);
  } catch (error) {
    return fail(error instanceof ZipValidationError ? error.message : "The ZIP could not be read.");
  }
  if (report.encryptedEntries > 0) {
    return fail(`${report.encryptedEntries} file(s) in this ZIP are password-protected. Upload an unencrypted archive.`);
  }

  const sha256 = await sha256Of(staged);
  const dupes = await packages().where("productId", "==", s.productId).where("sha256", "==", sha256).get();
  const activeDupe = dupes.docs.find((d) => d.get("status") === "active");
  if (activeDupe) {
    return fail(`This exact file is already uploaded as "${activeDupe.get("name")}" (v${activeDupe.get("version")}).`);
  }

  const [version, previous] = await Promise.all([
    adminDb.collection(COLLECTIONS.productVersions).doc(s.versionId).get(),
    s.replacesId ? packages().doc(s.replacesId).get() : Promise.resolve(null),
  ]);
  if (!version.exists || version.get("productId") !== s.productId) return fail("The version no longer exists.");

  const ref = packages().doc();
  const base = slugify(String(s.fileName).replace(/\.zip$/i, "")) || s.packageType;
  const storagePath = `products/${s.productId}/source-code/${s.versionId}/${base}-${ref.id.slice(0, 8)}.zip`;
  const finalFile = bucket.file(storagePath);
  await staged.copy(finalFile);
  await finalFile.setMetadata({
    contentType: "application/zip",
    contentDisposition: `attachment; filename="${String(s.fileName).replace(/["\\\r\n]/g, "_")}"`,
    cacheControl: "private, no-store",
    metadata: { productId: s.productId, versionId: s.versionId, packageId: ref.id, sha256 },
  });
  await staged.delete({ ignoreNotFound: true });

  const zip = {
    entries: report.entries,
    files: report.files,
    uncompressedBytes: report.uncompressedBytes,
    topLevel: report.topLevel,
    sample: report.sample,
  };
  try {
  await adminDb.runTransaction(async (tx) => {
    if (previous) {
      const old = await tx.get(previous.ref);
      if (old.get("status") !== "active") throw new ProductError("The package being replaced changed while uploading.");
      tx.update(previous.ref, { status: "replaced", replacedById: ref.id, updatedAt: FieldValue.serverTimestamp() });
    }
    tx.set(ref, {
      productId: s.productId,
      versionId: s.versionId,
      version: version.get("version"),
      packageType: s.packageType,
      name: s.name || PACKAGE_TYPE_LABELS[s.packageType as PackageType],
      fileName: s.fileName,
      fileSize: size,
      fileType: "application/zip",
      sha256,
      storagePath,
      releaseNotes: s.releaseNotes ?? "",
      status: "active",
      zip,
      replacesId: s.replacesId ?? null,
      replacedById: null,
      uploadedBy: actor.uid,
      uploadedByEmail: actor.email,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.update(sessionRef, { status: "completed", packageId: ref.id, finishedAt: FieldValue.serverTimestamp() });
  });
  } catch (error) {
    // Don't leave an unrecorded file behind.
    await finalFile.delete({ ignoreNotFound: true });
    await sessionRef.update({ status: "failed", error: (error as Error).message, finishedAt: FieldValue.serverTimestamp() });
    throw error;
  }

  return toPackage(await ref.get());
}

export async function cancelUpload(uploadId: string, uid: string) {
  const ref = sessions().doc(uploadId);
  const snap = await ref.get();
  if (!snap.exists || snap.get("uid") !== uid || snap.get("status") !== "pending") return;
  await adminStorage.bucket().file(String(snap.get("stagingPath"))).delete({ ignoreNotFound: true });
  await ref.update({ status: "cancelled", finishedAt: FieldValue.serverTimestamp() });
}

// ----- manage -----

/** Removes the file from Storage; the metadata record stays for the audit trail. */
export async function deletePackage(id: string, actorId: string) {
  const ref = packages().doc(id);
  const snap = await ref.get();
  if (!snap.exists || snap.get("status") === "deleted") throw new ProductError("Package not found.");
  await adminStorage.bucket().file(String(snap.get("storagePath"))).delete({ ignoreNotFound: true });
  await ref.update({ status: "deleted", deletedBy: actorId, deletedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  return toPackage(snap);
}

export async function updatePackageDetails(id: string, values: { name: string; releaseNotes: string }, actorId: string) {
  const ref = packages().doc(id);
  const snap = await ref.get();
  if (!snap.exists || snap.get("status") === "deleted") throw new ProductError("Package not found.");
  await ref.update({ ...values, updatedBy: actorId, updatedAt: FieldValue.serverTimestamp() });
}

/** Short-lived signed URL; the bucket itself is never public. */
export async function createDownloadUrl(id: string) {
  const pkg = await getPackage(id);
  if (!pkg || pkg.status === "deleted") throw new ProductError("Package not found.");
  const { signedUrlTtlMinutes } = await getUploadSettings();
  const [url] = await adminStorage
    .bucket()
    .file(pkg.storagePath)
    .getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + signedUrlTtlMinutes * 60 * 1000,
      responseDisposition: `attachment; filename="${pkg.fileName.replace(/["\\\r\n]/g, "_")}"`,
    });
  return { url, pkg, expiresInMinutes: signedUrlTtlMinutes };
}

// ----- storage usage -----

export interface StorageUsage {
  products: { productId: string; activeBytes: number; activeCount: number; historyBytes: number; historyCount: number; mediaBytes: number; mediaCount: number }[];
  staging: { files: number; bytes: number; stale: number; staleBytes: number };
  totals: { packageBytes: number; historyBytes: number; mediaBytes: number };
}

export async function getStorageUsage(): Promise<StorageUsage> {
  const [pkgSnap, mediaSnap, [stagingFiles]] = await Promise.all([
    packages().where("status", "in", ["active", "replaced"]).select("productId", "fileSize", "status").get(),
    adminDb.collection(COLLECTIONS.productMedia).select("productId", "size").get(),
    adminStorage.bucket().getFiles({ prefix: "uploads/staging/" }),
  ]);
  const byProduct = new Map<string, StorageUsage["products"][number]>();
  const row = (productId: string) => {
    let r = byProduct.get(productId);
    if (!r) {
      r = { productId, activeBytes: 0, activeCount: 0, historyBytes: 0, historyCount: 0, mediaBytes: 0, mediaCount: 0 };
      byProduct.set(productId, r);
    }
    return r;
  };
  for (const d of pkgSnap.docs) {
    const r = row(d.get("productId"));
    const size = Number(d.get("fileSize") ?? 0);
    if (d.get("status") === "active") {
      r.activeBytes += size;
      r.activeCount++;
    } else {
      r.historyBytes += size;
      r.historyCount++;
    }
  }
  for (const d of mediaSnap.docs) {
    const r = row(d.get("productId"));
    r.mediaBytes += Number(d.get("size") ?? 0);
    r.mediaCount++;
  }
  const now = Date.now();
  const staging = { files: 0, bytes: 0, stale: 0, staleBytes: 0 };
  for (const f of stagingFiles) {
    const size = Number(f.metadata.size ?? 0);
    staging.files++;
    staging.bytes += size;
    if (now - new Date(String(f.metadata.timeCreated)).getTime() > SESSION_TTL_MS) {
      staging.stale++;
      staging.staleBytes += size;
    }
  }
  const products = [...byProduct.values()];
  return {
    products,
    staging,
    totals: {
      packageBytes: products.reduce((s, p) => s + p.activeBytes, 0),
      historyBytes: products.reduce((s, p) => s + p.historyBytes, 0),
      mediaBytes: products.reduce((s, p) => s + p.mediaBytes, 0),
    },
  };
}

/** Deletes abandoned staging uploads older than 24 hours. */
export async function cleanupStaleStaging() {
  const [files] = await adminStorage.bucket().getFiles({ prefix: "uploads/staging/" });
  const now = Date.now();
  const stale = files.filter((f) => now - new Date(String(f.metadata.timeCreated)).getTime() > SESSION_TTL_MS);
  await Promise.all(stale.map((f) => f.delete({ ignoreNotFound: true })));
  return { deleted: stale.length, bytes: stale.reduce((s, f) => s + Number(f.metadata.size ?? 0), 0) };
}

export async function setUploadLimit(maxUploadSizeMb: number, actorId: string) {
  await adminDb.collection(COLLECTIONS.systemSettings).doc("general").set(
    { maxUploadSizeMb, updatedBy: actorId, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
}
