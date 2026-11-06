import { NextResponse, type NextRequest } from "next/server";
import { DomainError } from "@/lib/actions";
import { getStaffSession } from "@/lib/auth/session";
import { attachmentDownloadUrl } from "@/lib/docs/service";
import { hasPermission } from "@/lib/rbac/permissions";

/** Redirects staff to a 15-minute signed link for a documentation attachment. */
export async function GET(request: NextRequest, { params }: RouteContext<"/api/docs/[id]/attachments/[attachmentId]">) {
  const session = await getStaffSession();
  if (!session) return NextResponse.redirect(new URL("/login", request.url));
  if (!hasPermission(session.permissions, "documentation:view")) return NextResponse.json({ ok: false }, { status: 403 });
  const { id, attachmentId } = await params;
  try {
    const { url } = await attachmentDownloadUrl(id, attachmentId);
    return NextResponse.redirect(url, { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  } catch (error) {
    if (error instanceof DomainError) return NextResponse.json({ ok: false, error: error.message }, { status: 404 });
    throw error;
  }
}
