import { FieldValue } from "firebase-admin/firestore";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { SESSION_COOKIE_NAME, sessionMaxAgeMs } from "@/lib/auth/constants";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { isSameOrigin } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const bodySchema = z.object({ idToken: z.string().min(20).max(4096) });

function error(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, code, message }, { status });
}

/** POST: exchange a fresh Firebase ID token for an httpOnly session cookie. */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return error(403, "bad-origin", "Request origin not allowed.");

  const ip = clientIp(request.headers);
  const limit = rateLimit(`session:${ip}`, 10, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, code: "rate-limited", message: "Too many sign-in attempts. Please wait and try again." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return error(400, "bad-request", "Invalid request.");

  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(parsed.data.idToken, true);
  } catch {
    return error(401, "invalid-token", "Your sign-in could not be verified. Please try again.");
  }

  const userAgent = request.headers.get("user-agent");

  // Only mint sessions from a sign-in that just happened.
  if (Date.now() / 1000 - decoded.auth_time > 5 * 60) {
    return error(401, "stale-login", "Please sign in again.");
  }

  const staffSnap = await adminDb.collection(COLLECTIONS.staff).doc(decoded.uid).get();
  const staff = staffSnap.data();
  if (!staff || staff.status !== "active") {
    await logActivity({
      action: "auth.login_failed",
      actorId: decoded.uid,
      actorEmail: decoded.email ?? null,
      summary: "Sign-in rejected: account is not an active staff member",
      ip,
      userAgent,
    });
    return error(403, "not-staff", "This account does not have access to the INFIDEC admin.");
  }

  if (!decoded.email_verified) {
    return error(403, "email-unverified", "Please verify your email address before signing in.");
  }

  const expiresIn = sessionMaxAgeMs();
  const sessionCookie = await adminAuth.createSessionCookie(parsed.data.idToken, { expiresIn });

  (await cookies()).set(SESSION_COOKIE_NAME, sessionCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: Math.floor(expiresIn / 1000),
  });

  await Promise.all([
    staffSnap.ref.update({ lastLoginAt: FieldValue.serverTimestamp() }),
    logActivity({
      action: "auth.login",
      actorId: decoded.uid,
      actorEmail: decoded.email ?? null,
      summary: "Signed in",
      ip,
      userAgent,
    }),
  ]);

  return NextResponse.json({ ok: true });
}

/** DELETE: sign out — clears the cookie and revokes refresh tokens for this user. */
export async function DELETE(request: NextRequest) {
  if (!isSameOrigin(request)) return error(403, "bad-origin", "Request origin not allowed.");

  const jar = await cookies();
  const cookie = jar.get(SESSION_COOKIE_NAME)?.value;
  jar.delete(SESSION_COOKIE_NAME);

  if (cookie) {
    try {
      const decoded = await adminAuth.verifySessionCookie(cookie);
      await adminAuth.revokeRefreshTokens(decoded.sub);
      await logActivity({
        action: "auth.logout",
        actorId: decoded.uid,
        actorEmail: decoded.email ?? null,
        summary: "Signed out",
        ip: clientIp(request.headers),
        userAgent: request.headers.get("user-agent"),
      });
    } catch {
      // Cookie already invalid; clearing it is enough.
    }
  }
  return NextResponse.json({ ok: true });
}
