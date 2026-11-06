import { NextResponse, type NextRequest } from "next/server";
import { DomainError } from "@/lib/actions";
import { logActivity } from "@/lib/activity";
import { getStaffSession } from "@/lib/auth/session";
import { notifyTicketReply } from "@/lib/email/notify";
import { isSameOrigin } from "@/lib/http";
import { hasPermission } from "@/lib/rbac/permissions";
import { addMessage, MAX_TICKET_FILE } from "@/lib/support/service";

const json = (status: number, body: Record<string, unknown>) => NextResponse.json(body, { status });

/** Staff reply or internal note, with up to 5 attachments (multipart). */
export async function POST(request: NextRequest, { params }: RouteContext<"/api/tickets/[id]/messages">) {
  if (!isSameOrigin(request)) return json(403, { ok: false, error: "Request origin not allowed." });
  const session = await getStaffSession();
  if (!session) return json(401, { ok: false, error: "Your session has expired." });
  if (!hasPermission(session.permissions, "support:edit")) return json(403, { ok: false, error: "You can't reply to tickets." });
  if (Number(request.headers.get("content-length") ?? 0) > 5 * MAX_TICKET_FILE + 256 * 1024) return json(413, { ok: false, error: "Attachments are too large." });

  const { id } = await params;
  const form = await request.formData().catch(() => null);
  if (!form) return json(400, { ok: false, error: "Invalid message." });
  const body = String(form.get("body") ?? "").trim();
  const internal = form.get("internal") === "true";
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!body) return json(400, { ok: false, error: "Write a message." });
  if (body.length > 20_000) return json(400, { ok: false, error: "The message is too long." });
  if (files.length > 5) return json(400, { ok: false, error: "Attach at most 5 files." });

  try {
    const r = await addMessage(
      id,
      { body, internal, files: await Promise.all(files.map(async (f) => ({ name: f.name, type: f.type, buffer: Buffer.from(await f.arrayBuffer()) }))) },
      { uid: session.uid, name: session.displayName },
    );
    await logActivity({
      action: internal ? "ticket.note_added" : "ticket.replied",
      actorId: session.uid,
      actorEmail: session.email,
      targetType: "ticket",
      targetId: id,
      summary: `${internal ? "Internal note on" : "Replied to"} "${r.subject}"${r.attachments ? ` with ${r.attachments} file(s)` : ""}`,
    });
    const email = internal ? null : await notifyTicketReply(id, r.messageId, body, session.displayName, session.uid);
    return json(200, { ok: true, emailStatus: email?.status ?? null, emailError: email?.error ?? null });
  } catch (error) {
    if (error instanceof DomainError) return json(400, { ok: false, error: error.message });
    console.error("[ticket message]", error);
    return json(500, { ok: false, error: "Could not send the message." });
  }
}
