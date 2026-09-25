/**
 * A small in-memory rate limiter for the serverless functions. It counts
 * calls per key (the caller's address, from the platform's forwarded header)
 * inside a sliding window, per warm instance. That is what it is and no
 * more: a brake on bursts and on password guessing from one address, not a
 * fleet-wide quota. A shared store is the next step once traffic justifies
 * one.
 */
const buckets = new Map(); // "scope:key" -> timestamps (ms), oldest first
const HORIZON_MS = 60 * 60 * 1000;
const SWEEP_EVERY = 500;
let calls = 0;

export function clientKey(req) {
  const fwd = req.headers?.["x-forwarded-for"];
  const first = typeof fwd === "string" ? fwd.split(",")[0].trim() : Array.isArray(fwd) ? fwd[0] : "";
  return first || req.headers?.["x-real-ip"] || req.socket?.remoteAddress || "unknown";
}

/** True when this call is allowed: fewer than `max` calls for `key` in the last `windowMs`. */
export function allow(scope, key, max, windowMs, now = Date.now()) {
  const id = `${scope}:${key}`;
  const since = now - windowMs;
  const hits = (buckets.get(id) ?? []).filter((t) => t > since);
  if (hits.length >= max) {
    buckets.set(id, hits);
    return false;
  }
  hits.push(now);
  buckets.set(id, hits);
  if (++calls % SWEEP_EVERY === 0) sweep(now - HORIZON_MS);
  return true;
}

function sweep(before) {
  for (const [id, hits] of buckets) {
    const live = hits.filter((t) => t > before);
    if (live.length) buckets.set(id, live);
    else buckets.delete(id);
  }
}

/** Forget everything; for tests. */
export function resetRateLimits() {
  buckets.clear();
}

/**
 * Answer 429 and return true when the caller is over the limit for this
 * scope, so a handler can `if (throttled(...)) return;` before any work.
 * The message is a `text` too, so the chat client shows it as a reply.
 */
export function throttled(req, res, scope, max, windowMs, message = "Too many attempts from this connection. Try again in a few minutes.") {
  if (allow(scope, clientKey(req), max, windowMs)) return false;
  res.setHeader("Retry-After", String(Math.ceil(windowMs / 1000)));
  res.status(429).json({ ok: false, error: message, text: message });
  return true;
}
