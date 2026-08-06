import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  clearSessionCookie,
  createSession,
  hashPassword,
  normalizeEmail,
  sessionCookie,
  tokenFromCookieHeader,
  validPassword,
  verifyPassword,
  verifySession,
} from "./_auth.js";

test("password hashing round-trips and rejects wrong passwords", () => {
  const stored = hashPassword("correct horse battery");
  assert.ok(stored.startsWith("scrypt:16384:"));
  assert.ok(verifyPassword("correct horse battery", stored));
  assert.ok(!verifyPassword("wrong horse", stored));
  assert.ok(!verifyPassword("correct horse battery", "garbage"));
  assert.ok(!verifyPassword("correct horse battery", null));
  // Two hashes of the same password differ (fresh salt every time).
  assert.notEqual(stored, hashPassword("correct horse battery"));
});

test("sessions verify, expire, and refuse tampering", () => {
  const secret = "s3cret";
  const now = 1_800_000_000_000;
  const token = createSession("user-1", secret, now);

  assert.equal(verifySession(token, secret, now), "user-1");
  assert.equal(verifySession(token, secret, now + 29 * 86_400_000), "user-1");
  assert.equal(verifySession(token, secret, now + 31 * 86_400_000), null, "expired");
  assert.equal(verifySession(token, "other-secret", now), null, "wrong secret");

  const [uid, exp, sig] = token.split(".");
  assert.equal(verifySession(`user-2.${exp}.${sig}`, secret, now), null, "swapped user");
  assert.equal(verifySession(`${uid}.${Number(exp) + 999999}.${sig}`, secret, now), null, "extended expiry");
  assert.equal(verifySession("nonsense", secret, now), null);
  assert.equal(verifySession(null, secret, now), null);
});

test("cookies carry the token with the right flags and parse back", () => {
  const cookie = sessionCookie("abc.123.sig");
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Lax/);
  assert.equal(tokenFromCookieHeader(`other=1; ${cookie.split(";")[0]}; x=2`), "abc.123.sig");
  assert.equal(tokenFromCookieHeader("other=1"), null);
  assert.equal(tokenFromCookieHeader(undefined), null);
  assert.match(clearSessionCookie(), /Max-Age=0/);
});

test("email and password validation hold the line", () => {
  assert.equal(normalizeEmail("  Person@Example.COM "), "person@example.com");
  assert.equal(normalizeEmail("bad"), null);
  assert.equal(normalizeEmail("a@b"), null);
  assert.equal(normalizeEmail(null), null);
  assert.ok(validPassword("longenough"));
  assert.ok(!validPassword("short"));
  assert.ok(!validPassword(42));
});
