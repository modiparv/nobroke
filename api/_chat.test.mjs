import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/**
 * The chat endpoint calls a paid model with a person's plan, so nothing
 * may reach the model before the session check. The handler imports the
 * model SDK, which the test run does not install, so this reads the source:
 * the session check must come before the key is read and before any model
 * call. The check itself (requireSession) is tested in _auth.test.mjs.
 */
const source = readFileSync(new URL("./chat.ts", import.meta.url), "utf8");
const handler = source.slice(source.indexOf("export default async function handler"));

test("chat checks the session before it reads the key or calls the model", () => {
  const session = handler.indexOf("requireSession(req, res");
  const key = handler.indexOf("process.env.GROQ_API_KEY");
  const call = handler.indexOf("chat.completions.create");
  assert.ok(session > 0, "the handler must call requireSession");
  assert.ok(key > session, "the session check must come before the key is read");
  assert.ok(call > session, "the session check must come before the model call");
  assert.match(handler, /if \(!requireSession\(req, res, SIGN_IN_TEXT\)\) return;/);
});

test("the model has no tool that picks a mix or a fund", () => {
  const tools = [...source.matchAll(/name: "([a-z_]+)"/g)].map((m) => m[1]);
  assert.deepEqual(tools.sort(), ["add_goal", "auto_balance", "remove_goal", "set_cash", "set_goal_target", "set_goal_timeline", "set_monthly_investment"]);
});
