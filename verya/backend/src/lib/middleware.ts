// Shared backend middleware helpers (F39/F40): sanitization + rate limiting support.
// Fastify's @fastify/rate-limit handles per-route limiting; this key helper supports
// custom per-action limits inside handlers.

/** Treat user text as untrusted data: strip control chars, cap length. */
export function sanitizeInput(raw: string, maxLen = 20000): string {
  return raw
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .slice(0, maxLen);
}

/** Simple token-bucket in-process limiter for fine-grained action limits. */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimitKey(key: string, max: number, windowMs: number): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }
  bucket.count += 1;
  if (bucket.count > max) {
    return { ok: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  return { ok: true, retryAfterSec: 0 };
}
