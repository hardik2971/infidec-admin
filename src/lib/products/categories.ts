import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { SLUG_RE } from "./schema";
import { ProductError } from "./service";

export const categorySchema = z.object({
  name: z.string().trim().min(2, "Enter a category name.").max(60),
  slug: z.string().trim().min(2).max(64).regex(SLUG_RE, "Use lowercase letters, numbers and single hyphens."),
  description: z.string().trim().max(300),
});
export type CategoryValues = z.infer<typeof categorySchema>;

export interface CategoryRecord extends CategoryValues {
  id: string;
  order: number;
  productCount: number;
  createdAt: string | null;
}

const col = () => adminDb.collection(COLLECTIONS.productCategories);

export async function listCategories(): Promise<CategoryRecord[]> {
  const [snap, productsSnap] = await Promise.all([
    col().orderBy("order", "asc").get(),
    adminDb.collection(COLLECTIONS.products).select("categoryId").get(),
  ]);
  const counts = new Map<string, number>();
  for (const p of productsSnap.docs) {
    const c = p.get("categoryId");
    if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return snap.docs.map((d) => ({
    id: d.id,
    name: String(d.get("name") ?? ""),
    slug: String(d.get("slug") ?? ""),
    description: String(d.get("description") ?? ""),
    order: Number(d.get("order") ?? 0),
    productCount: counts.get(d.id) ?? 0,
    createdAt: d.get("createdAt") instanceof Timestamp ? d.get("createdAt").toDate().toISOString() : null,
  }));
}

export async function saveCategory(values: CategoryValues, actorId: string, id?: string): Promise<string> {
  const ref = id ? col().doc(id) : col().doc();
  await adminDb.runTransaction(async (tx) => {
    const clash = await tx.get(col().where("slug", "==", values.slug).limit(2));
    if (clash.docs.some((d) => d.id !== ref.id)) throw new ProductError(`The slug "${values.slug}" is already used.`);
    if (id) {
      const existing = await tx.get(ref);
      if (!existing.exists) throw new ProductError("Category not found.");
      tx.update(ref, { ...values, updatedAt: FieldValue.serverTimestamp(), updatedBy: actorId });
    } else {
      const last = await tx.get(col().orderBy("order", "desc").limit(1));
      tx.set(ref, {
        ...values,
        order: (last.docs[0]?.get("order") ?? -1) + 1,
        createdBy: actorId,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  });
  return ref.id;
}

export async function deleteCategory(id: string): Promise<string> {
  const ref = col().doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new ProductError("Category not found.");
  const used = (await adminDb.collection(COLLECTIONS.products).where("categoryId", "==", id).count().get()).data().count;
  if (used > 0) throw new ProductError(`${used} product(s) use this category. Move them to another category first.`);
  await ref.delete();
  return String(snap.get("name"));
}

/** Finds a category by slug or creates it (used by the website import). */
export async function ensureCategory(slug: string, name: string, actorId: string): Promise<string> {
  const existing = await col().where("slug", "==", slug).limit(1).get();
  if (!existing.empty) return existing.docs[0].id;
  return saveCategory({ slug, name, description: "" }, actorId);
}
