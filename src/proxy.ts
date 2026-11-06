import { NextResponse, type NextRequest } from "next/server";
import { PUBLIC_PATHS, SESSION_COOKIE_NAME } from "@/lib/auth/constants";

/**
 * Optimistic gate: bounces requests without a session cookie to the login page.
 * The cookie is cryptographically verified (with revocation checks) in the
 * Data Access Layer on every page, Server Action and Route Handler.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = request.cookies.has(SESSION_COOKIE_NAME);
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!isPublic && !hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|brand/|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
