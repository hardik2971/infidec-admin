import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { DomainError } from "@/lib/actions";
import { issueDownload } from "@/lib/downloads/service";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/**
 * Customer download authorization (spec §16), for the customer portal / website:
 *
 *   POST /api/downloads/authorize
 *   Authorization: Bearer <Firebase ID token of the signed-in customer>
 *   { "packageId": "…" }
 *
 * The customer is resolved from the verified token (customers.uid), never from the
 * request body; entitlement is checked server-side and a short-lived signed URL returned.
 */
export async function POST(request: NextRequest) {
  const ip = clientIp(request.headers);
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return NextResponse.json({ ok: false, error: "Sign in to download." }, { status: 401 });

  let uid: string;
  try {
    uid = (await adminAuth.verifyIdToken(token, true)).uid;
  } catch {
    return NextResponse.json({ ok: false, error: "Your session has expired. Sign in again." }, { status: 401 });
  }

  const limit = rateLimit(`download:${uid}`, 20, 60 * 60_000);
  if (!limit.ok) return NextResponse.json({ ok: false, error: "Too many download requests. Try again later." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } });

  const body = z.object({ packageId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/) }).safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });

  const customer = await adminDb.collection(COLLECTIONS.customers).where("uid", "==", uid).limit(1).get();
  if (customer.empty) return NextResponse.json({ ok: false, error: "No customer account is linked to this login." }, { status: 403 });

  try {
    const { url, expiresInMinutes, pkg } = await issueDownload({
      customerId: customer.docs[0].id,
      packageId: body.data.packageId,
      issuedBy: { type: "customer" },
      ip,
      userAgent: request.headers.get("user-agent"),
    });
    return NextResponse.json({ ok: true, url, expiresInMinutes, fileName: pkg.fileName, version: pkg.version }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof DomainError) return NextResponse.json({ ok: false, error: error.message }, { status: 403 });
    console.error("[download authorize]", error);
    return NextResponse.json({ ok: false, error: "Could not authorize the download." }, { status: 500 });
  }
}
