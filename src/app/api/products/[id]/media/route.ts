import { NextResponse, type NextRequest } from "next/server";
import { logActivity } from "@/lib/activity";
import { getStaffSession } from "@/lib/auth/session";
import { isSameOrigin } from "@/lib/http";
import { addProductMedia, MAX_IMAGE_BYTES } from "@/lib/products/media";
import { MEDIA_KINDS, type MediaKind } from "@/lib/products/schema";
import { ProductError } from "@/lib/products/service";
import { hasPermission } from "@/lib/rbac/permissions";

const json = (status: number, body: Record<string, unknown>) => NextResponse.json(body, { status });

/** Multipart image upload (Server Actions cap request bodies at 1 MB). */
export async function POST(request: NextRequest, { params }: RouteContext<"/api/products/[id]/media">) {
  if (!isSameOrigin(request)) return json(403, { ok: false, error: "Request origin not allowed." });

  const session = await getStaffSession();
  if (!session) return json(401, { ok: false, error: "Your session has expired. Please sign in again." });
  if (!hasPermission(session.permissions, "products:edit")) {
    return json(403, { ok: false, error: "You don't have permission to edit products." });
  }

  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return json(404, { ok: false, error: "Product not found." });

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_IMAGE_BYTES + 64 * 1024) return json(413, { ok: false, error: "Images must be 15 MB or smaller." });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json(400, { ok: false, error: "Invalid upload." });
  }
  const file = form.get("file");
  const kind = String(form.get("kind") ?? "");
  const alt = String(form.get("alt") ?? "").trim();
  if (!(file instanceof File)) return json(400, { ok: false, error: "Choose an image to upload." });
  if (!(MEDIA_KINDS as readonly string[]).includes(kind)) return json(400, { ok: false, error: "Unknown image type." });

  try {
    const result = await addProductMedia({
      productId: id,
      kind: kind as MediaKind,
      buffer: Buffer.from(await file.arrayBuffer()),
      alt: alt || file.name.replace(/\.[a-z0-9]+$/i, ""),
      actorId: session.uid,
    });
    if (!result.duplicate) {
      await logActivity({
        action: "product.media_added",
        actorId: session.uid,
        actorEmail: session.email,
        targetType: "product",
        targetId: id,
        productId: id,
        summary: `Uploaded ${kind} image "${file.name}"`,
        metadata: { mediaId: result.id, size: file.size },
      });
    }
    return json(200, { ok: true, id: result.id, duplicate: result.duplicate });
  } catch (error) {
    if (error instanceof ProductError) return json(400, { ok: false, error: error.message });
    console.error("[media upload]", error);
    return json(500, { ok: false, error: "Upload failed. Please try again." });
  }
}
