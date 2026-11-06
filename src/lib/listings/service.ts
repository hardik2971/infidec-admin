import "server-only";

import { FieldValue, Timestamp, type DocumentSnapshot } from "firebase-admin/firestore";
import { DomainError } from "@/lib/actions";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { compareSemver } from "@/lib/packages/schema";
import { listPackages } from "@/lib/packages/service";
import { listVersions } from "@/lib/packages/versions";
import { getProduct, listProductMedia } from "@/lib/products/service";
import { LISTING_NEXT, LISTING_STATUS_LABELS, readiness, type ListingRecord, type ListingStatus, type ListingValues } from "./schema";

const listings = () => adminDb.collection(COLLECTIONS.productListings);
const iso = (v: unknown) => (v instanceof Timestamp ? v.toDate().toISOString() : null);
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

function toListing(snap: DocumentSnapshot): ListingRecord {
  const d = snap.data() ?? {};
  return {
    id: snap.id,
    productId: String(d.productId ?? ""),
    marketplaceId: String(d.marketplaceId ?? "envato"),
    status: (d.status ?? "draft") as ListingStatus,
    itemTitle: String(d.itemTitle ?? ""),
    description: String(d.description ?? ""),
    category: String(d.category ?? ""),
    tags: strs(d.tags),
    versionId: String(d.versionId ?? ""),
    liveDemoUrl: String(d.liveDemoUrl ?? ""),
    sourcePackageId: String(d.sourcePackageId ?? ""),
    documentationPackageId: String(d.documentationPackageId ?? ""),
    thumbnailMediaId: String(d.thumbnailMediaId ?? ""),
    screenshotMediaIds: strs(d.screenshotMediaIds),
    changelog: String(d.changelog ?? ""),
    requirements: String(d.requirements ?? ""),
    checklist: d.checklist ?? {},
    rejectionNotes: String(d.rejectionNotes ?? ""),
    resubmissions: Number(d.resubmissions ?? 0),
    itemId: String(d.itemId ?? ""),
    itemUrl: String(d.itemUrl ?? ""),
    history: (Array.isArray(d.history) ? d.history : []).map((h: Record<string, unknown>) => ({
      status: h.status as ListingStatus,
      note: String(h.note ?? ""),
      byEmail: String(h.byEmail ?? ""),
      at: iso(h.at),
    })),
    updatedAt: iso(d.updatedAt),
    createdAt: iso(d.createdAt),
  };
}

export async function listListings() {
  const snap = await listings().limit(2000).get();
  return snap.docs.map(toListing).sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
}

export async function getListing(id: string) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return null;
  const snap = await listings().doc(id).get();
  return snap.exists ? toListing(snap) : null;
}

/** Creates a submission prefilled from the product, its latest version and its packages. */
export async function createListing(productId: string, marketplaceId: string, actor: { uid: string; email: string }) {
  const product = await getProduct(productId);
  if (!product) throw new DomainError("Product not found.");
  const [versions, media, packages] = await Promise.all([listVersions(productId), listProductMedia(productId), listPackages({ productId })]);
  const version = versions.filter((v) => v.status !== "deprecated").sort((a, b) => compareSemver(b.version, a.version))[0];
  const inVersion = packages.filter((p) => p.versionId === version?.id);
  const changelog = versions
    .filter((v) => v.status !== "draft")
    .map((v) => [`v${v.version}${v.releaseDate ? ` (${v.releaseDate})` : ""}`, ...v.newFeatures.map((f) => `- New: ${f}`), ...v.improvements.map((f) => `- Improved: ${f}`), ...v.bugFixes.map((f) => `- Fixed: ${f}`)].join("\n"))
    .join("\n\n");

  const ref = listings().doc();
  await ref.set({
    productId,
    marketplaceId,
    status: "draft",
    itemTitle: (product.title || product.name).slice(0, 100),
    description: product.fullDescription,
    category: "",
    tags: product.seo.keywords.slice(0, 15),
    versionId: version?.id ?? "",
    liveDemoUrl: product.demoUrl.startsWith("https://") ? product.demoUrl : "",
    sourcePackageId: inVersion.find((p) => p.packageType === "complete_source")?.id ?? "",
    documentationPackageId: inVersion.find((p) => p.packageType === "documentation")?.id ?? "",
    thumbnailMediaId: product.thumbnailMediaId ?? "",
    screenshotMediaIds: media.filter((m) => m.kind === "screenshot").map((m) => m.id),
    changelog,
    requirements: product.requirements.map((r) => `${r.title} ${r.text}`).join("\n"),
    checklist: {},
    rejectionNotes: "",
    resubmissions: 0,
    itemId: "",
    itemUrl: "",
    history: [{ status: "draft", note: "Created from product data", by: actor.uid, byEmail: actor.email, at: Timestamp.now() }],
    createdBy: actor.uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

export async function saveListing(id: string, values: ListingValues, actorId: string) {
  const ref = listings().doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new DomainError("Listing not found.");
  const status = snap.get("status") as ListingStatus;
  if (!["draft", "ready", "rejected"].includes(status)) throw new DomainError("Submitted listings can't be edited. Move it back to draft after a rejection.");
  const productId = snap.get("productId");

  // Every referenced record must belong to this listing's product (no cross-product assignment).
  const refs: [string, string][] = [
    [COLLECTIONS.productVersions, values.versionId],
    [COLLECTIONS.productPackages, values.sourcePackageId],
    [COLLECTIONS.productPackages, values.documentationPackageId],
    [COLLECTIONS.productMedia, values.thumbnailMediaId],
    ...values.screenshotMediaIds.map((m) => [COLLECTIONS.productMedia, m] as [string, string]),
  ];
  const checks = await Promise.all(refs.filter(([, v]) => v).map(([c, v]) => adminDb.collection(c).doc(v).get()));
  if (checks.some((d) => !d.exists || d.get("productId") !== productId)) throw new DomainError("A selected file or version doesn't belong to this product.");

  await ref.update({ ...values, ...(status === "ready" && !readiness(values).ready ? { status: "draft" } : {}), updatedBy: actorId, updatedAt: FieldValue.serverTimestamp() });
}

export async function transitionListing(
  id: string,
  status: ListingStatus,
  input: { note: string; itemId?: string; itemUrl?: string },
  actor: { uid: string; email: string },
) {
  const ref = listings().doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new DomainError("Listing not found.");
  const listing = toListing(snap);
  if (!LISTING_NEXT[listing.status].includes(status)) {
    throw new DomainError(`A ${LISTING_STATUS_LABELS[listing.status].toLowerCase()} listing can't move to ${LISTING_STATUS_LABELS[status].toLowerCase()}.`);
  }
  if (status === "ready" && !readiness(listing).ready) throw new DomainError("Complete every checklist item first.");
  if (status === "rejected" && !input.note) throw new DomainError("Record the reviewer's rejection notes.");
  if (status === "published" && !/^\d{1,12}$/.test(input.itemId ?? "")) throw new DomainError("Enter the numeric item ID the marketplace assigned.");

  const update: Record<string, unknown> = {
    status,
    history: FieldValue.arrayUnion({ status, note: input.note, by: actor.uid, byEmail: actor.email, at: Timestamp.now() }),
    updatedBy: actor.uid,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (status === "rejected") update.rejectionNotes = input.note;
  if (status === "draft" && listing.status === "rejected") update.resubmissions = FieldValue.increment(1);
  if (status === "submitted") update.submittedAt = FieldValue.serverTimestamp();
  if (status === "published") {
    update.itemId = input.itemId;
    update.itemUrl = input.itemUrl ?? "";
  }
  await ref.update(update);

  if (status === "published") {
    await adminDb.collection(COLLECTIONS.products).doc(listing.productId).update({
      marketplaceId: listing.marketplaceId,
      marketplaceItemId: input.itemId,
      ...(input.itemUrl ? { marketplaceUrl: input.itemUrl } : {}),
      updatedBy: actor.uid,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  return listing;
}

export async function deleteListing(id: string) {
  const snap = await listings().doc(id).get();
  if (!snap.exists) throw new DomainError("Listing not found.");
  if (snap.get("status") !== "draft") throw new DomainError("Only draft listings can be deleted.");
  await snap.ref.delete();
  return toListing(snap);
}
