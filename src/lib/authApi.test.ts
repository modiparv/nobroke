import { strict as assert } from "node:assert";
import { test } from "node:test";
import { credentialError } from "./authApi.ts";

test("credentialError names each bad input, and passes good ones", () => {
  // Empty and malformed email.
  assert.match(credentialError("", "password1", true)!, /email/i);
  assert.match(credentialError("  ", "password1", true)!, /email/i);
  assert.match(credentialError("notanemail", "password1", true)!, /format|look/i);
  assert.match(credentialError("a@b", "password1", true)!, /format|look/i);

  // Password rules differ by mode.
  assert.match(credentialError("a@b.com", "", true)!, /password/i);
  assert.match(credentialError("a@b.com", "short", true)!, /8/);
  assert.equal(credentialError("a@b.com", "short", false), null, "login accepts a short existing password");
  assert.match(credentialError("a@b.com", "", false)!, /password/i);

  // Valid.
  assert.equal(credentialError("person@example.com", "longenough", true), null);
  assert.equal(credentialError(" person@example.com ", "longenough", true), null, "email is trimmed");
});
