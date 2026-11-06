import "server-only";

import { FieldValue, Timestamp, type DocumentSnapshot } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { ProductError } from "@/lib/products/service";
import { compareSemver, type VersionRecord, type VersionStatus, type VersionValues } from "./schema";

const versions = () => adminDb.collection(COLLECTIONS.productVersions);
const iso = (v: unknown) => (v instanceof Timestamp ? v.toDate().toISOString() : null);
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

function toVersion(snap: DocumentSnapshot, stats?: { count: number; bytes: number }): VersionRecord {
  const d = snap.data() ?? {};
  return {
    id: snap.id,
    productId: String(d.productId ?? ""),
    version: String(d.version ?? ""),
    status: (d.status ?? "draft") as VersionStatus,
    title: String(d.title ?? ""),
    releaseDate: String(d.releaseDate ?? ""),
    releaseNotes: String(d.releaseNotes ?? ""),
    newFeatures: strs(d.newFeatures),
    improvements: strs(d.improvements),
    bugFixes: strs(d.bugFixes),
    packageCount: stats?.count ?? 0,
    packageBytes: stats?.bytes ?? 0,
    createdAt: iso(d.createdAt),
    publishedAt: iso(d.publishedAt),
    deprecatedAt: iso(d.deprecatedAt),
  };
}

async function packageStats(productId?: string) {
  let q = adminDb.collection(COLLECTIONS.productPackages).where("status", "==", "active");
  if (productId) q = q.where("productId", "==", productId);
  const snap = await q.select("versionId", "fileSize").get();
  const stats = new Map<string, { count: number; bytes: number }>();
  for (const d of snap.docs) {
    const s = stats.get(d.get("versionId")) ?? { count: 0, bytes: 0 };
    s.count++;
    s.bytes += Number(d.get("fileSize") ?? 0);
    stats.set(d.get("versionId"), s);
  }
  return stats;
}

/** Versions of one product (or all products), newest version first. */
export async function listVersions(productId?: string): Promise<VersionRecord[]> {
  const q = productId ? versions().where("productId", "==", productId) : versions();
  const [snap, stats] = await Promise.all([q.limit(2000).get(), packageStats(productId)]);
  return snap.docs.map((d) => toVersion(d, stats.get(d.id))).sort((a, b) => compareSemver(b.version, a.version));
}

export async function getVersion(id: string): Promise<VersionRecord | null> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return null;
  const snap = await versions().doc(id).get();
  if (!snap.exists) return null;
  const stats = await packageStats(snap.get("productId"));
  return toVersion(snap, stats.get(id));
}

export async function createVersion(productId: string, values: VersionValues, actorId: string): Promise<string> {
  const productRef = adminDb.collection(COLLECTIONS.products).doc(productId);
  const ref = versions().doc();
  await adminDb.runTransaction(async (tx) => {
    const product = await tx.get(productRef);
    if (!product.exists) throw new ProductError("Product not found.");
    const clash = await tx.get(versions().where("productId", "==", productId).where("version", "==", values.version).limit(1));
    if (!clash.empty) throw new ProductError(`Version ${values.version} already exists for this product.`);
    tx.set(ref, {
      productId,
      ...values,
      status: "draft",
      createdBy: actorId,
      updatedBy: actorId,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  return ref.id;
}

export async function updateVersion(id: string, values: VersionValues, actorId: string) {
  const ref = versions().doc(id);
  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new ProductError("Version not found.");
    if (snap.get("version") !== values.version) {
      if (snap.get("status") !== "draft") throw new ProductError("Only draft versions can be renumbered.");
      const clash = await tx.get(versions().where("productId", "==", snap.get("productId")).where("version", "==", values.version).limit(1));
      if (!clash.empty) throw new ProductError(`Version ${values.version} already exists for this product.`);
    }
    tx.update(ref, { ...values, updatedBy: actorId, updatedAt: FieldValue.serverTimestamp() });
  });
}

/** Keeps product.version equal to the highest published version. */
async function syncProductVersion(productId: string, actorId: string) {
  const published = await versions().where("productId", "==", productId).where("status", "==", "published").get();
  const latest = published.docs.map((d) => String(d.get("version"))).sort(compareSemver).at(-1);
  if (latest) {
    await adminDb.collection(COLLECTIONS.products).doc(productId).update({
      version: latest,
      updatedBy: actorId,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  return latest ?? null;
}

export async function setVersionStatus(id: string, status: VersionStatus, actorId: string) {
  const ref = versions().doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new ProductError("Version not found.");
  const previous = snap.get("status") as VersionStatus;
  if (previous === status) return { previous, productVersion: null, version: String(snap.get("version")), productId: String(snap.get("productId")) };

  if (status === "published") {
    const active = await adminDb
      .collection(COLLECTIONS.productPackages)
      .where("versionId", "==", id)
      .where("status", "==", "active")
      .count()
      .get();
    if (active.data().count === 0) throw new ProductError("Upload at least one source package before publishing this version.");
  }

  await ref.update({
    status,
    ...(status === "published" ? { publishedAt: FieldValue.serverTimestamp() } : {}),
    ...(status === "deprecated" ? { deprecatedAt: FieldValue.serverTimestamp() } : {}),
    updatedBy: actorId,
    updatedAt: FieldValue.serverTimestamp(),
  });
  const productVersion = await syncProductVersion(String(snap.get("productId")), actorId);
  return { previous, productVersion, version: String(snap.get("version")), productId: String(snap.get("productId")) };
}

export async function deleteVersion(id: string) {
  const ref = versions().doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new ProductError("Version not found.");
  if (snap.get("status") !== "draft") throw new ProductError("Only draft versions can be deleted. Deprecate published versions instead.");
  const pkgs = await adminDb.collection(COLLECTIONS.productPackages).where("versionId", "==", id).count().get();
  if (pkgs.data().count > 0) throw new ProductError("Delete this version's packages first.");
  await ref.delete();
  return { version: String(snap.get("version")), productId: String(snap.get("productId")) };
}
