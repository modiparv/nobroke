/**
 * Types for the part of _auth.js that TypeScript functions import
 * (api/chat.ts), so the Vercel build compiles them without "implicitly has
 * an 'any' type" (TS7016). The helper stays plain JavaScript because the
 * auth endpoints and the tests import it as such. Keep these signatures in
 * step with the JavaScript.
 */
export interface SessionRequest {
  headers?: Record<string, string | string[] | undefined>;
}

export interface SessionResponse {
  status(code: number): { json(body: unknown): unknown };
}

/** The session userId on a request, or null. */
export function sessionUserId(req: SessionRequest, now?: number): string | null;

/**
 * The signed-in user's id, or null after answering 401 with `message` as
 * both `error` and `text`.
 */
export function requireSession(req: SessionRequest, res: SessionResponse, message?: string, now?: number): string | null;
