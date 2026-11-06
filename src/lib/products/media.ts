import "server-only";

import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import sharp, { type Metadata } from "sharp";
import { adminDb, adminStorage } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import type { MediaKind } from "./schema";
import { ProductError } from "./service";

export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_DIMENSION = 10_000;

/** Raster formats only: SVG can carry script and is never accepted. */
const SIGNATURES: { type: string; ext: string; test: (b: Buffer) => boolean }[] = [
  { type: "image/png", ext: "png", test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { type: "image/jpeg", ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: "image/webp", ext: "webp", test: (b) => b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP" },
];

export function sniffImage(buffer: Buffer) {
  return SIGNATURES.find((s) => s.test(buffer)) ?? null;
}

const SINGLE_SLOT: Partial<Record<MediaKind, "logoMediaId" | "thumbnailMediaId">> = {
  logo: "logoMediaId",
  thumbnail: "thumbnailMediaId",
};

export interface AddMediaInput {
  productId: string;
  kind: MediaKind;
  buffer: Buffer;
  alt: string;
  section?: string | null;
  actorId: string;
  source?: { type: "upload" } | { type: "website-import"; url: string };
}

/**
 * Validates and stores an image in private Storage, then records it in productMedia.
 * Logo and thumbnail are single-slot: a new one replaces the previous file.
 */
export async function addProductMedia(input: AddMediaInput): Promise<{ id: string; duplicate: boolean }> {
  const { productId, kind, buffer } = input;
  if (buffer.length === 0) throw new ProductError("The file is empty.");
  if (buffer.length > MAX_IMAGE_BYTES) throw new ProductError("Images must be 15 MB or smaller.");

  const signature = sniffImage(buffer);
  if (!signature) throw new ProductError("Only PNG, JPEG and WebP images are accepted.");

  let meta: Metadata;
  try {
    meta = await sharp(buffer).metadata();
  } catch {
    throw new ProductError("The image could not be read. It may be corrupted.");
  }
  if (!meta.width || !meta.height || meta.width > MAX_DIMENSION || meta.height > MAX_DIMENSION) {
    throw new ProductError("Image dimensions are outside the supported range.");
  }

  const productRef = adminDb.collection(COLLECTIONS.products).doc(productId);
  if (!(await productRef.get()).exists) throw new ProductError("Product not found.");

  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const mediaCol = adminDb.collection(COLLECTIONS.productMedia);
  const existing = await mediaCol.where("productId", "==", productId).where("sha256", "==", sha256).limit(1).get();
  if (!existing.empty && existing.docs[0].get("kind") === kind) {
    return { id: existing.docs[0].id, duplicate: true };
  }

  const ref = mediaCol.doc();
  const folder = kind === "screenshot" ? "media/screenshots" : "media";
  const storagePath = `products/${productId}/${folder}/${kind === "screenshot" ? "" : `${kind}-`}${ref.id}.${signature.ext}`;
  await adminStorage.bucket().file(storagePath).save(buffer, {
    resumable: false,
    contentType: signature.type,
    metadata: { cacheControl: "private, max-age=31536000, immutable", metadata: { productId, mediaId: ref.id, sha256 } },
  });

  const slot = SINGLE_SLOT[kind];
  const previous = slot ? await mediaCol.where("productId", "==", productId).where("kind", "==", kind).get() : null;
  const order =
    kind === "screenshot"
      ? ((await mediaCol.where("productId", "==", productId).where("kind", "==", "screenshot").orderBy("order", "desc").limit(1).get()).docs[0]?.get("order") ?? -1) + 1
      : 0;

  const batch = adminDb.batch();
  batch.set(ref, {
    productId,
    kind,
    alt: input.alt.slice(0, 300),
    section: input.section ?? null,
    order,
    storagePath,
    contentType: signature.type,
    size: buffer.length,
    width: meta.width,
    height: meta.height,
    sha256,
    source: input.source ?? { type: "upload" },
    uploadedBy: input.actorId,
    createdAt: FieldValue.serverTimestamp(),
  });
  if (slot) {
    batch.update(productRef, { [slot]: ref.id, updatedAt: FieldValue.serverTimestamp(), updatedBy: input.actorId });
    previous?.docs.forEach((d) => batch.delete(d.ref));
  }
  await batch.commit();

  if (previous) {
    await Promise.all(
      previous.docs.map((d) => adminStorage.bucket().file(String(d.get("storagePath"))).delete({ ignoreNotFound: true })),
    );
  }
  return { id: ref.id, duplicate: false };
}

export async function deleteProductMedia(productId: string, mediaId: string, actorId: string) {
  const ref = adminDb.collection(COLLECTIONS.productMedia).doc(mediaId);
  const snap = await ref.get();
  if (!snap.exists || snap.get("productId") !== productId) throw new ProductError("Image not found.");

  const kind = snap.get("kind") as MediaKind;
  const batch = adminDb.batch();
  batch.delete(ref);
  const slot = SINGLE_SLOT[kind];
  if (slot) {
    batch.update(adminDb.collection(COLLECTIONS.products).doc(productId), {
      [slot]: null,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actorId,
    });
  }
  await batch.commit();
  await adminStorage.bucket().file(String(snap.get("storagePath"))).delete({ ignoreNotFound: true });
  return { kind };
}

export async function updateMediaAlt(productId: string, mediaId: string, alt: string) {
  const ref = adminDb.collection(COLLECTIONS.productMedia).doc(mediaId);
  const snap = await ref.get();
  if (!snap.exists || snap.get("productId") !== productId) throw new ProductError("Image not found.");
  await ref.update({ alt: alt.slice(0, 300) });
}

/** Persists a new screenshot order (ids must all belong to the product). */
export async function reorderScreenshots(productId: string, orderedIds: string[]) {
  const col = adminDb.collection(COLLECTIONS.productMedia);
  const snap = await col.where("productId", "==", productId).where("kind", "==", "screenshot").get();
  const owned = new Set(snap.docs.map((d) => d.id));
  if (orderedIds.length !== owned.size || orderedIds.some((id) => !owned.has(id))) {
    throw new ProductError("The screenshot list changed. Refresh and try again.");
  }
  const batch = adminDb.batch();
  orderedIds.forEach((id, order) => batch.update(col.doc(id), { order }));
  await batch.commit();
}

/** Looks up a media record's Storage file for the authenticated media route. */
export async function readMediaFile(mediaId: string) {
  const snap = await adminDb.collection(COLLECTIONS.productMedia).doc(mediaId).get();
  if (!snap.exists) return null;
  const file = adminStorage.bucket().file(String(snap.get("storagePath")));
  return { file, contentType: String(snap.get("contentType")), size: Number(snap.get("size") ?? 0), productId: String(snap.get("productId")) };
}
