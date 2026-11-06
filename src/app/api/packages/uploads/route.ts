import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getStaffSession } from "@/lib/auth/session";
import { isSameOrigin } from "@/lib/http";
import { PACKAGE_TYPES } from "@/lib/packages/schema";
import { initUpload } from "@/lib/packages/service";
import { ProductError } from "@/lib/products/service";
import { hasPermission } from "@/lib/rbac/permissions";

const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const body = z.object({
  productId: id,
  versionId: id,
  packageType: z.enum(PACKAGE_TYPES),
  name: z.string().trim().max(120),
  releaseNotes: z.string().trim().max(5000),
  fileName: z.string().trim().min(1).max(255),
  fileSize: z.number().int().positive(),
  replacesId: id.nullable().optional(),
});

/** Registers a package upload and returns a short-lived token for the direct-to-Storage upload. */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ ok: false, error: "Request origin not allowed." }, { status: 403 });
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ ok: false, error: "Your session has expired. Please sign in again." }, { status: 401 });
  if (!hasPermission(session.permissions, "packages:upload")) {
    return NextResponse.json({ ok: false, error: "You don't have permission to upload source packages." }, { status: 403 });
  }

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid upload." }, { status: 400 });

  try {
    const result = await initUpload(parsed.data, { uid: session.uid, roleId: session.roleId });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof ProductError) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    console.error("[upload init]", error);
    return NextResponse.json({ ok: false, error: "Could not start the upload." }, { status: 500 });
  }
}
