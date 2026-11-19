import { strict as assert } from "node:assert";
import test from "node:test";
import { parseCommand } from "./command.ts";
import { copilotSuggestions, investExample, investExampleAmount } from "./suggestions.ts";

test("the monthly-amount example is sized to the plan, never a fixed ₹40,000", () => {
  // A student investing ₹2,900 is offered ₹4,000, not ₹40,000.
  assert.equal(investExample(2900), "I can invest ₹4,000 a month");
  assert.equal(investExample(37000), "I can invest ₹46,500 a month");
  assert.equal(investExample(0), "I can invest ₹5,000 a month");
});

test("the example is understood as that amount, whatever the size", () => {
  for (const monthly of [0, 500, 2900, 37000, 79900, 96000, 250000, 640000]) {
    const text = investExample(monthly);
    const cmd = parseCommand(text);
    assert.equal(cmd?.kind, "setPool", text);
    assert.equal(cmd?.kind === "setPool" ? cmd.amount : null, investExampleAmount(monthly), text);
    assert.ok(investExampleAmount(monthly) >= monthly, "the example never suggests investing less");
  }
});

test("someone without an account is offered commands only, and each one is understood on the device", () => {
  const offered = copilotSuggestions(false, 37000);
  assert.equal(offered.length, 5);
  for (const text of offered) assert.ok(parseCommand(text), `"${text}" must not need the model`);
  // Signed in, one question is added, and that one does go to the model.
  const signedIn = copilotSuggestions(true, 37000);
  assert.equal(signedIn.length, 6);
  assert.equal(parseCommand(signedIn[5]), null);
});
