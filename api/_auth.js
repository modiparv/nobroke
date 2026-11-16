import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Auth core: password hashing, stateless signed sessions, cookie plumbing.
 * Dependency-free on purpose (node:crypto only) so it is unit-tested locally
 * like the engines are; database access stays in the endpoint handlers.
 *
 * Sessions are HMAC-signed tokens (userId.expiry.signature) in an HttpOnly
 * cookie: no session table, nothing to leak beyond the secret. Rotating the
 * secret signs everyone out, which is the correct failure mode.
 */

const SCRYPT_N = 16384;
const KEY_LEN = 64;
const SESSION_DAYS = 30;
export const COOKIE_NAME = "nb_session";

export function authSecret() {
  // A dedicated AUTH_SECRET is recommended; CRON_SECRET keeps the module
  // usable before it is provisioned. No secret, no auth.
  return process.env.AUTH_SECRET ?? process.env.CRON_SECRET ?? null;
}

export function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, KEY_LEN, { N: SCRYPT_N }).toString("hex");
  return `scrypt:${SCRYPT_N}:${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  try {
    const [scheme, nStr, salt, hex] = String(stored).split(":");
    if (scheme !== "scrypt") return false;
    const expected = Buffer.from(hex, "hex");
    const actual = scryptSync(password, salt, expected.length, { N: Number(nStr) });
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function sign(payload, secret) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createSession(userId, secret, now = Date.now()) {
  const expires = now + SESSION_DAYS * 86_400_000;
  const payload = `${userId}.${expires}`;
  return `${payload}.${sign(payload, secret)}`;
}

/** Returns the userId for a valid, unexpired token; null otherwise. */
export function verifySession(token, secret, now = Date.now()) {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expiresStr, signature] = parts;
  const payload = `${userId}.${expiresStr}`;
  const expected = sign(payload, secret);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const expires = Number(expiresStr);
  if (!Number.isFinite(expires) || now >= expires) return null;
  return userId;
}

export function sessionCookie(token) {
  const maxAge = SESSION_DAYS * 86_400;
  return `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

export function tokenFromCookieHeader(header) {
  if (typeof header !== "string") return null;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === COOKIE_NAME) return rest.join("=") || null;
  }
  return null;
}

/** The session userId on a request, or null. */
export function sessionUserId(req, now = Date.now()) {
  const secret = authSecret();
  if (!secret) return null;
  const token = tokenFromCookieHeader(req.headers?.cookie);
  if (!token) return null;
  return verifySession(token, secret, now);
}

/**
 * The signed-in user's id, or null after answering 401. An endpoint that
 * costs money or reads private data calls this before doing any work:
 * `const userId = requireSession(req, res); if (!userId) return;`.
 * The message is sent as both `error` and `text`, so the chat client can
 * show it as the reply.
 */
export function requireSession(req, res, message = "Sign in to continue.", now = Date.now()) {
  const userId = sessionUserId(req, now);
  if (userId) return userId;
  res.status(401).json({ ok: false, error: message, text: message });
  return null;
}

/**
 * New accounts are by invitation: the code a person types must match
 * INVITE_CODE for this deployment. Case and surrounding spaces are ignored,
 * since codes are typed on phones. No INVITE_CODE configured means sign-up
 * is closed, which is the safe way to fail. Compared in constant time.
 */
export function inviteAccepted(code) {
  const expected = String(process.env.INVITE_CODE ?? "").trim().toLowerCase();
  if (!expected) return false;
  const a = Buffer.from(String(code ?? "").trim().toLowerCase());
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(email) {
  const v = String(email ?? "").trim().toLowerCase();
  return EMAIL_RE.test(v) && v.length <= 254 ? v : null;
}

export function validPassword(password) {
  return typeof password === "string" && password.length >= 8 && password.length <= 200;
}
