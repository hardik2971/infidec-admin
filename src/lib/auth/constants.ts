export const SESSION_COOKIE_NAME = "__session";

/** Firebase allows session cookies between 5 minutes and 14 days. */
export function sessionMaxAgeMs(): number {
  const days = Number(process.env.SESSION_COOKIE_DAYS ?? 5);
  const clamped = Math.min(Math.max(Number.isFinite(days) ? days : 5, 1), 14);
  return clamped * 24 * 60 * 60 * 1000;
}

/** Paths reachable without a session. */
export const PUBLIC_PATHS = ["/login", "/forgot-password"];
