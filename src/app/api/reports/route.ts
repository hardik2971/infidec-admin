import { NextResponse, type NextRequest } from "next/server";
import { logActivity } from "@/lib/activity";
import { getStaffSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/rbac/permissions";
import { buildReport } from "@/lib/reports/build";
import { parseReportFilters, toCsv } from "@/lib/reports/schema";

/** CSV export of a report. Requires reports:export. */
export async function GET(request: NextRequest) {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 });
  if (!hasPermission(session.permissions, "reports:export")) return NextResponse.json({ ok: false, error: "You don't have permission to export reports." }, { status: 403 });
  const filters = parseReportFilters(request.nextUrl.searchParams);
  try {
    const report = await buildReport(filters);
    await logActivity({
      action: "report.exported",
      actorId: session.uid,
      actorEmail: session.email,
      targetType: "report",
      targetId: filters.type,
      productId: filters.productId,
      summary: `Exported the ${report.title} report (${filters.from} – ${filters.to}, ${report.rows.length} rows) as CSV`,
    });
    return new NextResponse(toCsv(report), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="infidec-${filters.type.replaceAll("_", "-")}-${filters.from}-to-${filters.to}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[report csv]", error);
    return NextResponse.json({ ok: false, error: "Could not build the report." }, { status: 500 });
  }
}
