import "server-only";

/**
 * Fixed-window in-memory rate limiter. It is per server instance, which is
 * enough to blunt brute-force bursts in front of Firebase Auth's own abuse
 * protection. Replace with a shared store (e.g. Firestore/Redis) when running
 * many instances.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 10_000) {
      for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
    }
    return { ok: true, retryAfterSec: 0 };
  }
  bucket.count += 1;
  return {
    ok: bucket.count <= limit,
    retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000),
  };
}

export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}
