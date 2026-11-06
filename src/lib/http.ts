import "server-only";

import type { NextRequest } from "next/server";

/** Public hostnames the admin is served from (e.g. behind Firebase Hosting), comma-separated. */
export function publicHosts(): string[] {
  return (process.env.APP_PUBLIC_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Rejects cross-site requests: the Origin must match the host serving the app — the
 * direct host, the public host forwarded by a reverse proxy, or a configured public host.
 */
export function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  let originHost: string;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    return false;
  }
  const allowed = [request.headers.get("host"), request.headers.get("x-forwarded-host")?.split(",")[0]?.trim(), ...publicHosts()]
    .filter((h): h is string => !!h)
    .map((h) => h.toLowerCase());
  return allowed.includes(originHost);
}
