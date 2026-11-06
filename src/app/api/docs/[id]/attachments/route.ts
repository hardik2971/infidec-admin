import { NextResponse, type NextRequest } from "next/server";
import { DomainError } from "@/lib/actions";
import { logActivity } from "@/lib/activity";
import { getStaffSession } from "@/lib/auth/session";
import { addAttachment, MAX_ATTACHMENT_BYTES } from "@/lib/docs/service";
import { isSameOrigin } from "@/lib/http";
import { hasPermission } from "@/lib/rbac/permissions";

const json = (status: number, body: Record<string, unknown>) => NextResponse.json(body, { status });

/** Attach a PDF or ZIP to a documentation page (multipart, ≤ 50 MB). */
export async function POST(request: NextRequest, { params }: RouteContext<"/api/docs/[id]/attachments">) {
  if (!isSameOrigin(request)) return json(403, { ok: false, error: "Request origin not allowed." });
  const session = await getStaffSession();
  if (!session) return json(401, { ok: false, error: "Your session has expired." });
  if (!hasPermission(session.permissions, "documentation:upload")) return json(403, { ok: false, error: "You can't upload documentation files." });

  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return json(404, { ok: false, error: "Document not found." });
  if (Number(request.headers.get("content-length") ?? 0) > MAX_ATTACHMENT_BYTES + 64 * 1024) return json(413, { ok: false, error: "Attachments are limited to 50 MB." });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return json(400, { ok: false, error: "Choose a PDF or ZIP file." });

  try {
    const att = await addAttachment(id, { name: file.name, buffer: Buffer.from(await file.arrayBuffer()) }, session.uid);
    await logActivity({ action: "doc.attachment_added", actorId: session.uid, actorEmail: session.email, targetType: "doc", targetId: id, summary: `Attached "${file.name}"` });
    return json(200, { ok: true, attachment: att });
  } catch (error) {
    if (error instanceof DomainError) return json(400, { ok: false, error: error.message });
    console.error("[doc attachment]", error);
    return json(500, { ok: false, error: "Upload failed." });
  }
}
