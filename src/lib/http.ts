import "server-only";

import type { NextRequest } from "next/server";

/** Rejects cross-site requests: the Origin must match the host serving the app. */
export function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}
