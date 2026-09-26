/**
 * Types for _ratelimit.js, so the TypeScript functions that import it
 * (api/chat.ts) compile without "implicitly has an 'any' type" (TS7016)
 * in the Vercel build. The helper stays plain JavaScript because the
 * auth endpoints and the tests import it as such. Keep these signatures
 * in step with the JavaScript.
 *
 * The request and response shapes are the few members the limiter reads
 * and writes, so any Node or Vercel request and response fits.
 */
export interface RateLimitRequest {
  headers?: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}

export interface RateLimitResponse {
  setHeader(name: string, value: string): unknown;
  status(code: number): { json(body: unknown): unknown };
}

/** The caller's address from the platform's forwarded header, else "unknown". */
export function clientKey(req: RateLimitRequest): string;

/** True when this call is allowed: fewer than `max` calls for `key` in the last `windowMs`. */
export function allow(scope: string, key: string, max: number, windowMs: number, now?: number): boolean;

/** Forget everything; for tests. */
export function resetRateLimits(): void;

/**
 * Answer 429 and return true when the caller is over the limit for this
 * scope, so a handler can `if (throttled(...)) return;` before any work.
 */
export function throttled(
  req: RateLimitRequest,
  res: RateLimitResponse,
  scope: string,
  max: number,
  windowMs: number,
  message?: string,
): boolean;
