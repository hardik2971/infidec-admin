import { NextResponse, type NextRequest } from "next/server";
import { getStaffSession } from "@/lib/auth/session";
import { readMediaFile } from "@/lib/products/media";
import { hasPermission } from "@/lib/rbac/permissions";

/**
 * Streams a private product image to authorised staff. Storage objects are never
 * public and no Storage URL is exposed to the browser.
 */
export async function GET(_request: NextRequest, { params }: RouteContext<"/api/media/[id]">) {
  const session = await getStaffSession();
  if (!session) return new NextResponse(null, { status: 401 });
  if (!hasPermission(session.permissions, "products:view")) return new NextResponse(null, { status: 403 });

  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return new NextResponse(null, { status: 404 });

  const media = await readMediaFile(id);
  if (!media) return new NextResponse(null, { status: 404 });

  const [buffer] = await media.file.download();
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": media.contentType,
      "Content-Length": String(buffer.length),
      // Media ids are unique per upload, so the bytes never change.
      "Cache-Control": "private, max-age=86400, immutable",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
