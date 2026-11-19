import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { mock, test } from "node:test";

/**
 * The chat endpoint calls a paid model with a person's plan, so nothing may
 * reach the model without a session. The handler is called for real, with
 * the model SDK replaced by a counter: a refused call must never build it.
 */
let built = 0;
let asked = 0;
mock.module("groq-sdk", {
  defaultExport: class {
    constructor() {
      built++;
    }
    chat = { completions: { create: async () => (asked++, { choices: [{ message: { content: "ok" } }] }) } };
  },
});
process.env.AUTH_SECRET = "test-secret";
process.env.GROQ_API_KEY = "test-key";
const { default: handler } = await import("./chat.ts");
const { createSession } = await import("./_auth.js");

function call(cookie) {
  const res = { code: 0, body: null, setHeader() {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  const req = { method: "POST", headers: cookie ? { cookie } : {}, body: { history: [{ role: "user", text: "what is an index fund?" }] } };
  return handler(req, res).then(() => res);
}

test("chat refuses anyone without a live session before the model is touched", async () => {
  const expired = createSession("u1", "test-secret", Date.now() - 400 * 86_400_000);
  const wrongKey = createSession("u1", "another-secret");
  for (const cookie of [undefined, "nb_session=u1.9999999999999.forged", `nb_session=${expired}`, `nb_session=${wrongKey}`]) {
    const r = await call(cookie);
    assert.equal(r.code, 401, `cookie ${cookie}`);
    assert.match(r.body.text, /^Sign in to ask questions/);
  }
  assert.equal(built, 0, "a refused call must not build the model client");
  assert.equal(asked, 0, "a refused call must not reach the model");
});

test("a signed-in person reaches the model", async () => {
  const r = await call(`nb_session=${createSession("u1", "test-secret")}`);
  assert.equal(r.code, 200);
  assert.equal(built, 1);
  assert.equal(asked, 1);
});

test("the limit is counted per account, and a call without a session uses up nobody's allowance", async () => {
  const { resetRateLimits } = await import("./_ratelimit.js");
  resetRateLimits();
  const before = asked;
  const one = `nb_session=${createSession("u-one", "test-secret")}`;
  const two = `nb_session=${createSession("u-two", "test-secret")}`;
  // A room of people without accounts, all on one address, try the chat first.
  for (let i = 0; i < 40; i++) assert.equal((await call(undefined)).code, 401);
  // Thirty messages in five minutes for one account, then a wait.
  for (let i = 0; i < 30; i++) assert.equal((await call(one)).code, 200, `message ${i + 1}`);
  const over = await call(one);
  assert.equal(over.code, 429);
  assert.match(over.body.text, /^Too many messages/);
  assert.equal(asked - before, 30, "the refused message must not reach the model");
  // Another account on the same address is not held back by the first.
  assert.equal((await call(two)).code, 200);
});

test("a missing model key is answered in plain words, with no setting names", async () => {
  const key = process.env.GROQ_API_KEY;
  delete process.env.GROQ_API_KEY;
  const logged = mock.method(console, "error", () => {});
  try {
    const r = await call(`nb_session=${createSession("u-three", "test-secret")}`);
    assert.equal(r.code, 200);
    assert.doesNotMatch(r.body.text, /GROQ|Vercel|redeploy/i);
    assert.match(r.body.text, /not available right now/);
    assert.equal(logged.mock.callCount(), 1, "the cause still goes to the logs");
  } finally {
    logged.mock.restore();
    process.env.GROQ_API_KEY = key;
  }
});

test("the model has no tool that picks a mix or a fund", () => {
  const source = readFileSync(new URL("./chat.ts", import.meta.url), "utf8");
  const tools = [...source.matchAll(/name: "([a-z_]+)"/g)].map((m) => m[1]);
  assert.deepEqual(tools.sort(), ["add_goal", "auto_balance", "remove_goal", "set_cash", "set_goal_target", "set_goal_timeline", "set_monthly_investment"]);
});
