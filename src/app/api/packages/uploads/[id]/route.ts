import { NextResponse, type NextRequest } from "next/server";
import { logActivity } from "@/lib/activity";
import { getStaffSession } from "@/lib/auth/session";
import { isSameOrigin } from "@/lib/http";
import { PACKAGE_TYPE_LABELS } from "@/lib/packages/schema";
import { cancelUpload, completeUpload } from "@/lib/packages/service";
import { ProductError } from "@/lib/products/service";
import { hasPermission } from "@/lib/rbac/permissions";

/** Validating and checksumming a large ZIP can take a while. */
export const maxDuration = 300;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function guard(request: NextRequest) {
  if (!isSameOrigin(request)) return { error: NextResponse.json({ ok: false, error: "Request origin not allowed." }, { status: 403 }) };
  const session = await getStaffSession();
  if (!session) return { error: NextResponse.json({ ok: false, error: "Your session has expired." }, { status: 401 }) };
  if (!hasPermission(session.permissions, "packages:upload")) {
    return { error: NextResponse.json({ ok: false, error: "You don't have permission to upload source packages." }, { status: 403 }) };
  }
  return { session };
}

/** POST: the browser finished uploading to staging — validate, checksum and publish to the version. */
export async function POST(request: NextRequest, { params }: RouteContext<"/api/packages/uploads/[id]">) {
  const { session, error } = await guard(request);
  if (error) return error;
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ ok: false, error: "Upload not found." }, { status: 404 });

  try {
    const pkg = await completeUpload(id, { uid: session.uid, email: session.email });
    await logActivity({
      action: pkg.replacesId ? "package.replaced" : "package.uploaded",
      actorId: session.uid,
      actorEmail: session.email,
      targetType: "package",
      targetId: pkg.id,
      productId: pkg.productId,
      summary: `${pkg.replacesId ? "Replaced" : "Uploaded"} ${PACKAGE_TYPE_LABELS[pkg.packageType]} "${pkg.fileName}" for v${pkg.version}`,
      metadata: { sha256: pkg.sha256, fileSize: pkg.fileSize, versionId: pkg.versionId, replacesId: pkg.replacesId },
    });
    return NextResponse.json({ ok: true, package: pkg });
  } catch (err) {
    if (err instanceof ProductError) {
      await logActivity({
        action: "package.upload_rejected",
        actorId: session.uid,
        actorEmail: session.email,
        targetType: "upload",
        targetId: id,
        summary: `Upload rejected: ${err.message}`,
      });
      return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
    }
    console.error("[upload complete]", err);
    return NextResponse.json({ ok: false, error: "Validation failed unexpectedly. Please try again." }, { status: 500 });
  }
}

/** DELETE: the user cancelled — remove the staged file. */
export async function DELETE(request: NextRequest, { params }: RouteContext<"/api/packages/uploads/[id]">) {
  const { session, error } = await guard(request);
  if (error) return error;
  const { id } = await params;
  if (UUID.test(id)) await cancelUpload(id, session.uid);
  return NextResponse.json({ ok: true });
}
