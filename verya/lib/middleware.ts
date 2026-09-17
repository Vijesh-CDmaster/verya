// Verya — API protection: in-memory sliding-window rate limiter + input sanitization.
// (F39/F40: rate limiting on public APIs; treat user text as untrusted data.)

type Bucket = { hits: number[]; };
const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, limit = 10, windowMs = 60_000): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  const bucket = buckets.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);
  if (bucket.hits.length >= limit) {
    const oldest = bucket.hits[0];
    buckets.set(key, bucket);
    return { ok: false, retryAfterSec: Math.ceil((windowMs - (now - oldest)) / 1000) };
  }
  bucket.hits.push(now);
  buckets.set(key, bucket);
  return { ok: true, retryAfterSec: 0 };
}

export function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd ? fwd.split(",")[0].trim() : "local";
}

/**
 * Strip control characters and zero-width chars from user text (F39 sanitization).
 * Prompt-injection defense (F40) is behavioral: system prompts instruct stages to treat
 * user text as data, and stage outputs are schema-validated before use.
 */
export function sanitizeInput(raw: string): string {
  return raw
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u2028\u2029]/g, "")
    .slice(0, 20000);
}
