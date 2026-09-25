import { strict as assert } from "node:assert";
import { test } from "node:test";
import { allow, clientKey, resetRateLimits, throttled } from "./_ratelimit.js";

test("allow: the window slides, scopes and keys are separate", () => {
  resetRateLimits();
  const t0 = 1_000_000;
  for (let i = 0; i < 3; i++) assert.equal(allow("login", "1.1.1.1", 3, 1000, t0 + i), true);
  assert.equal(allow("login", "1.1.1.1", 3, 1000, t0 + 3), false, "fourth call inside the window");
  assert.equal(allow("login", "2.2.2.2", 3, 1000, t0 + 3), true, "another address");
  assert.equal(allow("chat", "1.1.1.1", 3, 1000, t0 + 3), true, "another scope");
  assert.equal(allow("login", "1.1.1.1", 3, 1000, t0 + 1001), true, "the oldest hit has left the window");
});

test("clientKey: the first forwarded address, then real-ip, then unknown", () => {
  assert.equal(clientKey({ headers: { "x-forwarded-for": "9.9.9.9, 10.0.0.1" } }), "9.9.9.9");
  assert.equal(clientKey({ headers: { "x-real-ip": "8.8.8.8" } }), "8.8.8.8");
  assert.equal(clientKey({ headers: {} }), "unknown");
});

test("throttled: answers 429 with Retry-After once over the limit", () => {
  resetRateLimits();
  const req = { headers: { "x-forwarded-for": "3.3.3.3" } };
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(k, v) {
      this.headers[k] = v;
    },
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(b) {
      this.body = b;
      return this;
    },
  };
  assert.equal(throttled(req, res, "t", 2, 60_000), false);
  assert.equal(throttled(req, res, "t", 2, 60_000), false);
  assert.equal(throttled(req, res, "t", 2, 60_000), true);
  assert.equal(res.statusCode, 429);
  assert.equal(res.headers["Retry-After"], "60");
  assert.match(res.body.error, /Too many/);
  assert.equal(res.body.text, res.body.error);
});
