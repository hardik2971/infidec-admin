import { NextResponse, type NextRequest } from "next/server";
import { logActivity } from "@/lib/activity";
import { getStaffSession } from "@/lib/auth/session";
import { clientIp } from "@/lib/rate-limit";
import { createDownloadUrl } from "@/lib/packages/service";
import { ProductError } from "@/lib/products/service";
import { hasPermission } from "@/lib/rbac/permissions";

/** Staff download: logs the request, then redirects to a short-lived signed URL. */
export async function GET(request: NextRequest, { params }: RouteContext<"/api/packages/[id]/download">) {
  const session = await getStaffSession();
  if (!session) return NextResponse.redirect(new URL("/login", request.url));
  if (!hasPermission(session.permissions, "packages:download")) {
    return NextResponse.json({ ok: false, error: "You don't have permission to download source packages." }, { status: 403 });
  }

  const { id } = await params;
  try {
    const { url, pkg, expiresInMinutes } = await createDownloadUrl(id);
    await logActivity({
      action: "package.downloaded",
      actorId: session.uid,
      actorEmail: session.email,
      targetType: "package",
      targetId: pkg.id,
      productId: pkg.productId,
      summary: `Downloaded "${pkg.fileName}" (v${pkg.version})`,
      metadata: { sha256: pkg.sha256, expiresInMinutes },
      ip: clientIp(request.headers),
      userAgent: request.headers.get("user-agent"),
    });
    return NextResponse.redirect(url, { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  } catch (error) {
    if (error instanceof ProductError) return NextResponse.json({ ok: false, error: error.message }, { status: 404 });
    console.error("[package download]", error);
    return NextResponse.json({ ok: false, error: "Could not create a download link." }, { status: 500 });
  }
}
