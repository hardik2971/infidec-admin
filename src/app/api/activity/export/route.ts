import { Timestamp } from "firebase-admin/firestore";
import { NextResponse, type NextRequest } from "next/server";
import { logActivity } from "@/lib/activity";
import { getStaffSession } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { hasPermission } from "@/lib/rbac/permissions";
import { toCsv } from "@/lib/reports/schema";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ROWS = 20_000;

/** CSV export of the audit trail for a date range (default: last 30 days). Requires activity:export. */
export async function GET(request: NextRequest) {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 });
  if (!hasPermission(session.permissions, "activity:export")) return NextResponse.json({ ok: false, error: "You don't have permission to export activity logs." }, { status: 403 });

  const sp = request.nextUrl.searchParams;
  const to = DATE_RE.test(sp.get("to") ?? "") ? sp.get("to")! : new Date().toISOString().slice(0, 10);
  const fromDefault = new Date(`${to}T00:00:00Z`);
  fromDefault.setUTCDate(fromDefault.getUTCDate() - 29);
  const from = DATE_RE.test(sp.get("from") ?? "") ? sp.get("from")! : fromDefault.toISOString().slice(0, 10);

  try {
    const snap = await adminDb
      .collection(COLLECTIONS.activityLogs)
      .where("createdAt", ">=", Timestamp.fromDate(new Date(`${from}T00:00:00Z`)))
      .where("createdAt", "<=", Timestamp.fromDate(new Date(`${to}T23:59:59.999Z`)))
      .orderBy("createdAt", "desc")
      .limit(MAX_ROWS)
      .get();
    const rows = snap.docs.map((d) => {
      const x = d.data();
      return {
        time: x.createdAt instanceof Timestamp ? x.createdAt.toDate().toISOString() : "",
        actor: String(x.actorEmail ?? "System"),
        action: String(x.action ?? ""),
        target: [x.targetType, x.targetId].filter(Boolean).join(":"),
        summary: String(x.summary ?? ""),
        ip: String(x.ip ?? ""),
      };
    });
    const csv = toCsv({
      filters: { type: "customers", from, to },
      title: "Activity logs",
      columns: [
        { key: "time", label: "Time (UTC)", kind: "text" },
        { key: "actor", label: "Actor", kind: "text" },
        { key: "action", label: "Action", kind: "text" },
        { key: "target", label: "Target", kind: "text" },
        { key: "summary", label: "Summary", kind: "text" },
        { key: "ip", label: "IP", kind: "text" },
      ],
      rows,
      notes: [],
      generatedAt: new Date().toISOString(),
    });
    await logActivity({
      action: "report.activity_exported",
      actorId: session.uid,
      actorEmail: session.email,
      targetType: "activityLogs",
      targetId: "export",
      summary: `Exported ${rows.length} activity log entries (${from} – ${to}) as CSV`,
    });
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="infidec-activity-${from}-to-${to}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[activity export]", error);
    return NextResponse.json({ ok: false, error: "Could not export activity logs." }, { status: 500 });
  }
}
