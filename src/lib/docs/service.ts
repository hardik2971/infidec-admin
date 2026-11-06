import "server-only";

import { randomUUID } from "node:crypto";
import { FieldValue, Timestamp, type DocumentSnapshot } from "firebase-admin/firestore";
import { DomainError } from "@/lib/actions";
import { adminDb, adminStorage } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { inspectZip, ZipValidationError } from "@/lib/packages/zip";
import { slugify } from "@/lib/products/schema";
import { STANDARD_OUTLINE, type DocAttachment, type DocKind, type DocRecord, type DocRevision, type DocValues } from "./schema";

const docs = () => adminDb.collection(COLLECTIONS.productDocumentation);
const iso = (v: unknown) => (v instanceof Timestamp ? v.toDate().toISOString() : null);
export const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;
const MAX_REVISIONS = 50;

function toDoc(snap: DocumentSnapshot): DocRecord {
  const d = snap.data() ?? {};
  return {
    id: snap.id,
    productId: String(d.productId ?? ""),
    kind: d.kind === "section" ? "section" : "page",
    parentId: d.parentId ?? null,
    order: Number(d.order ?? 0),
    status: d.status === "published" ? "published" : "draft",
    title: String(d.title ?? ""),
    slug: String(d.slug ?? ""),
    summary: String(d.summary ?? ""),
    content: String(d.content ?? ""),
    videoUrl: String(d.videoUrl ?? ""),
    attachments: (Array.isArray(d.attachments) ? d.attachments : []).map((a: Record<string, unknown>) => ({
      ...(a as unknown as DocAttachment),
      uploadedAt: iso(a.uploadedAt),
    })),
    revision: Number(d.revision ?? 0),
    updatedAt: iso(d.updatedAt),
    updatedByEmail: String(d.updatedByEmail ?? ""),
    publishedAt: iso(d.publishedAt),
  };
}

export async function listDocs(productId?: string): Promise<DocRecord[]> {
  const q = productId ? docs().where("productId", "==", productId) : docs();
  const snap = await q.limit(3000).get();
  return snap.docs.map(toDoc);
}

export async function getDoc(id: string): Promise<DocRecord | null> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return null;
  const snap = await docs().doc(id).get();
  return snap.exists ? toDoc(snap) : null;
}

async function nextOrder(productId: string, parentId: string | null) {
  const siblings = await docs().where("productId", "==", productId).where("parentId", "==", parentId).select("order").get();
  return siblings.docs.reduce((m, d) => Math.max(m, Number(d.get("order") ?? 0)), -1) + 1;
}

async function uniqueSlug(productId: string, base: string, exceptId?: string) {
  const all = await docs().where("productId", "==", productId).select("slug").get();
  const taken = new Set(all.docs.filter((d) => d.id !== exceptId).map((d) => d.get("slug")));
  let slug = base || "page";
  for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`;
  return slug;
}

export async function createDoc(
  input: { productId: string; kind: DocKind; parentId: string | null; title: string },
  actor: { uid: string; email: string },
): Promise<string> {
  const product = await adminDb.collection(COLLECTIONS.products).doc(input.productId).get();
  if (!product.exists) throw new DomainError("Product not found.");
  if (input.parentId) {
    const parent = await docs().doc(input.parentId).get();
    if (!parent.exists || parent.get("productId") !== input.productId) throw new DomainError("The parent section belongs to another product.");
  }
  const ref = docs().doc();
  await ref.set({
    productId: input.productId,
    kind: input.kind,
    parentId: input.parentId,
    order: await nextOrder(input.productId, input.parentId),
    status: "draft",
    title: input.title,
    slug: await uniqueSlug(input.productId, slugify(input.title)),
    summary: "",
    content: "",
    videoUrl: "",
    attachments: [],
    revision: 1,
    createdBy: actor.uid,
    updatedBy: actor.uid,
    updatedByEmail: actor.email,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

/** Saves a page and snapshots the previous content as a revision. */
export async function saveDoc(id: string, values: DocValues, actor: { uid: string; email: string }) {
  const ref = docs().doc(id);
  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new DomainError("Document not found.");
    const current = toDoc(snap);
    if (values.slug !== current.slug) {
      const clash = await tx.get(docs().where("productId", "==", current.productId).where("slug", "==", values.slug).limit(2));
      if (clash.docs.some((d) => d.id !== id)) throw new DomainError(`The slug "${values.slug}" is already used in this product's documentation.`);
    }
    const changed = current.content !== values.content || current.title !== values.title;
    if (changed) {
      tx.set(ref.collection("revisions").doc(String(current.revision).padStart(6, "0")), {
        revision: current.revision,
        title: current.title,
        content: current.content,
        savedAt: snap.get("updatedAt") ?? FieldValue.serverTimestamp(),
        savedByEmail: current.updatedByEmail,
      });
    }
    tx.update(ref, {
      ...values,
      revision: changed ? current.revision + 1 : current.revision,
      updatedBy: actor.uid,
      updatedByEmail: actor.email,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  // Keep the history bounded.
  const old = await ref.collection("revisions").orderBy("revision", "desc").offset(MAX_REVISIONS).get();
  await Promise.all(old.docs.map((d) => d.ref.delete()));
}

export async function listRevisions(id: string): Promise<DocRevision[]> {
  const snap = await docs().doc(id).collection("revisions").orderBy("revision", "desc").limit(MAX_REVISIONS).get();
  return snap.docs.map((d) => ({
    id: d.id,
    revision: Number(d.get("revision")),
    title: String(d.get("title") ?? ""),
    content: String(d.get("content") ?? ""),
    savedAt: iso(d.get("savedAt")),
    savedByEmail: String(d.get("savedByEmail") ?? ""),
  }));
}

export async function restoreRevision(id: string, revisionId: string, actor: { uid: string; email: string }) {
  const [doc, rev] = await Promise.all([getDoc(id), docs().doc(id).collection("revisions").doc(revisionId).get()]);
  if (!doc || !rev.exists) throw new DomainError("Revision not found.");
  await saveDoc(id, { title: rev.get("title"), slug: doc.slug, content: rev.get("content"), videoUrl: doc.videoUrl, summary: doc.summary }, actor);
  return Number(rev.get("revision"));
}

export async function setDocStatus(id: string, status: "draft" | "published", actorId: string) {
  const ref = docs().doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new DomainError("Document not found.");
  await ref.update({
    status,
    ...(status === "published" ? { publishedAt: FieldValue.serverTimestamp() } : {}),
    updatedBy: actorId,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return toDoc(snap);
}

/** Reorders siblings and optionally moves a document to another parent within the same product. */
export async function moveDoc(id: string, parentId: string | null, orderedSiblingIds: string[]) {
  const snap = await docs().doc(id).get();
  if (!snap.exists) throw new DomainError("Document not found.");
  const productId = snap.get("productId");
  if (parentId) {
    if (parentId === id) throw new DomainError("A section can't contain itself.");
    let cursor: string | null = parentId;
    while (cursor) {
      const p = await docs().doc(cursor).get();
      if (!p.exists || p.get("productId") !== productId) throw new DomainError("Invalid destination.");
      if (p.id === id) throw new DomainError("A section can't be moved inside itself.");
      cursor = p.get("parentId") ?? null;
    }
  }
  const siblings = await docs().where("productId", "==", productId).get();
  const valid = new Set(siblings.docs.map((d) => d.id));
  if (!orderedSiblingIds.includes(id) || orderedSiblingIds.some((s) => !valid.has(s))) throw new DomainError("The page list changed — refresh and try again.");
  const batch = adminDb.batch();
  orderedSiblingIds.forEach((sid, order) => batch.update(docs().doc(sid), sid === id ? { order, parentId } : { order }));
  await batch.commit();
}

export async function deleteDoc(id: string) {
  const ref = docs().doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new DomainError("Document not found.");
  const children = await docs().where("parentId", "==", id).limit(1).get();
  if (!children.empty) throw new DomainError("Move or delete the pages inside this section first.");
  const doc = toDoc(snap);
  await Promise.all(doc.attachments.map((a) => adminStorage.bucket().file(a.storagePath).delete({ ignoreNotFound: true })));
  const revisions = await ref.collection("revisions").get();
  const batch = adminDb.batch();
  revisions.docs.forEach((r) => batch.delete(r.ref));
  batch.delete(ref);
  await batch.commit();
  return doc;
}

/** Creates the standard documentation outline (sections + empty draft pages) that doesn't exist yet. */
export async function createStandardOutline(productId: string, actor: { uid: string; email: string }) {
  const existing = await listDocs(productId);
  let created = 0;
  for (const section of STANDARD_OUTLINE) {
    const sectionDoc = existing.find((d) => d.kind === "section" && d.parentId === null && d.title === section.title);
    const sectionId = sectionDoc?.id ?? (await createDoc({ productId, kind: "section", parentId: null, title: section.title }, actor));
    if (!sectionDoc) created++;
    for (const page of section.pages) {
      if (existing.some((d) => d.parentId === sectionId && d.title === page)) continue;
      await createDoc({ productId, kind: "page", parentId: sectionId, title: page }, actor);
      created++;
    }
  }
  return created;
}

// ----- attachments (PDF / ZIP) -----

function sniffAttachment(buf: Buffer): { type: string; ext: string } | null {
  if (buf.subarray(0, 5).toString("latin1") === "%PDF-") return { type: "application/pdf", ext: "pdf" };
  if (buf[0] === 0x50 && buf[1] === 0x4b && (buf[2] === 0x03 || buf[2] === 0x05)) return { type: "application/zip", ext: "zip" };
  return null;
}

export async function addAttachment(id: string, file: { name: string; buffer: Buffer }, actorId: string): Promise<DocAttachment> {
  const ref = docs().doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new DomainError("Document not found.");
  if (file.buffer.length === 0) throw new DomainError("The file is empty.");
  if (file.buffer.length > MAX_ATTACHMENT_BYTES) throw new DomainError("Attachments are limited to 50 MB. Upload larger bundles as Documentation packages.");
  const kind = sniffAttachment(file.buffer);
  if (!kind) throw new DomainError("Only PDF and ZIP files can be attached.");
  if (kind.ext === "zip") {
    try {
      const report = await inspectZip(async (s, e) => file.buffer.subarray(s, e + 1), file.buffer.length);
      if (report.encryptedEntries) throw new DomainError("Password-protected ZIPs can't be attached.");
    } catch (error) {
      if (error instanceof ZipValidationError) throw new DomainError(error.message);
      throw error;
    }
  }
  const attachmentId = randomUUID();
  const base = slugify(file.name.replace(/\.[a-z0-9]+$/i, "")) || "attachment";
  const storagePath = `products/${snap.get("productId")}/documentation/${id}/${base}-${attachmentId.slice(0, 8)}.${kind.ext}`;
  await adminStorage.bucket().file(storagePath).save(file.buffer, {
    resumable: false,
    contentType: kind.type,
    metadata: { contentDisposition: `attachment; filename="${file.name.replace(/["\\\r\n]/g, "_")}"`, cacheControl: "private, no-store" },
  });
  const attachment = { id: attachmentId, fileName: file.name, contentType: kind.type, size: file.buffer.length, storagePath, uploadedAt: Timestamp.now() };
  await ref.update({ attachments: FieldValue.arrayUnion(attachment), updatedBy: actorId, updatedAt: FieldValue.serverTimestamp() });
  return { ...attachment, uploadedAt: attachment.uploadedAt.toDate().toISOString() };
}

export async function removeAttachment(id: string, attachmentId: string, actorId: string) {
  const ref = docs().doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new DomainError("Document not found.");
  const list = (snap.get("attachments") ?? []) as (DocAttachment & { uploadedAt: unknown })[];
  const target = list.find((a) => a.id === attachmentId);
  if (!target) throw new DomainError("Attachment not found.");
  await adminStorage.bucket().file(target.storagePath).delete({ ignoreNotFound: true });
  await ref.update({ attachments: list.filter((a) => a.id !== attachmentId), updatedBy: actorId, updatedAt: FieldValue.serverTimestamp() });
  return target;
}

export async function attachmentDownloadUrl(id: string, attachmentId: string) {
  const doc = await getDoc(id);
  const att = doc?.attachments.find((a) => a.id === attachmentId);
  if (!doc || !att) throw new DomainError("Attachment not found.");
  const [url] = await adminStorage.bucket().file(att.storagePath).getSignedUrl({
    version: "v4",
    action: "read",
    expires: Date.now() + 15 * 60 * 1000,
    responseDisposition: `${att.contentType === "application/pdf" ? "inline" : "attachment"}; filename="${att.fileName.replace(/["\\\r\n]/g, "_")}"`,
  });
  return { url, doc, att };
}
