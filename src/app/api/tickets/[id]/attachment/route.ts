import { NextResponse, type NextRequest } from "next/server";
import { DomainError } from "@/lib/actions";
import { getStaffSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/rbac/permissions";
import { ticketAttachmentUrl } from "@/lib/support/service";

/** GET ?path=tickets/{id}/… — redirects staff to a 10-minute signed link. */
export async function GET(request: NextRequest, { params }: RouteContext<"/api/tickets/[id]/attachment">) {
  const session = await getStaffSession();
  if (!session) return NextResponse.redirect(new URL("/login", request.url));
  if (!hasPermission(session.permissions, "support:view")) return NextResponse.json({ ok: false }, { status: 403 });
  const { id } = await params;
  try {
    const url = await ticketAttachmentUrl(id, request.nextUrl.searchParams.get("path") ?? "");
    return NextResponse.redirect(url, { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  } catch (error) {
    if (error instanceof DomainError) return NextResponse.json({ ok: false, error: error.message }, { status: 404 });
    throw error;
  }
}
