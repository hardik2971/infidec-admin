"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { AuthorizationError, assertPermission } from "@/lib/auth/session";
import { importCatalogProduct, type ImportResult } from "@/lib/products/import";
import { ProductError } from "@/lib/products/service";

const input = z.object({
  sourceSlug: z.string().min(1).max(200),
  status: z.enum(["published", "draft"]),
});

export async function importProductAction(
  values: z.input<typeof input>,
): Promise<{ ok: true; result: ImportResult } | { ok: false; error: string }> {
  try {
    const actor = await assertPermission("products:create");
    const { sourceSlug, status } = input.parse(values);
    if (status === "published") await assertPermission("products:publish");

    const result = await importCatalogProduct(sourceSlug, status, actor.uid);
    await logActivity({
      action: "product.imported",
      actorId: actor.uid,
      actorEmail: actor.email,
      targetType: "product",
      targetId: result.productId,
      productId: result.productId,
      summary: `Imported "${result.name}" from infidec.com as ${result.status} with ${result.imagesImported} image(s)`,
      metadata: { sourceSlug, imageFailures: result.imageFailures.length },
    });
    refresh();
    return { ok: true, result };
  } catch (error) {
    if (error instanceof AuthorizationError || error instanceof ProductError) return { ok: false, error: error.message };
    if (error instanceof z.ZodError) return { ok: false, error: "Invalid import request." };
    console.error("[import]", error);
    return { ok: false, error: "The import failed. Please try again." };
  }
}
