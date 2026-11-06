"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { AuthorizationError, assertPermission } from "@/lib/auth/session";
import { categorySchema, deleteCategory, saveCategory } from "@/lib/products/categories";
import { ProductError } from "@/lib/products/service";

type Result = { ok: true; message: string } | { ok: false; error: string };

function failure(error: unknown): Result {
  if (error instanceof AuthorizationError || error instanceof ProductError) return { ok: false, error: error.message };
  if (error instanceof z.ZodError) return { ok: false, error: error.issues[0]?.message ?? "Please check the form." };
  console.error("[category action]", error);
  return { ok: false, error: "Something went wrong. Please try again." };
}

const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);

export async function saveCategoryAction(input: { id?: string; values: unknown }): Promise<Result> {
  try {
    const id = input.id ? idSchema.parse(input.id) : undefined;
    const actor = await assertPermission(id ? "categories:edit" : "categories:create");
    const values = categorySchema.parse(input.values);
    const savedId = await saveCategory(values, actor.uid, id);
    await logActivity({
      action: id ? "category.updated" : "category.created",
      actorId: actor.uid,
      actorEmail: actor.email,
      targetType: "category",
      targetId: savedId,
      summary: `${id ? "Updated" : "Created"} category "${values.name}"`,
    });
    refresh();
    return { ok: true, message: id ? "Category updated." : "Category created." };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteCategoryAction(id: string): Promise<Result> {
  try {
    const actor = await assertPermission("categories:delete");
    const target = idSchema.parse(id);
    const name = await deleteCategory(target);
    await logActivity({
      action: "category.deleted",
      actorId: actor.uid,
      actorEmail: actor.email,
      targetType: "category",
      targetId: target,
      summary: `Deleted category "${name}"`,
    });
    refresh();
    return { ok: true, message: `"${name}" deleted.` };
  } catch (error) {
    return failure(error);
  }
}
