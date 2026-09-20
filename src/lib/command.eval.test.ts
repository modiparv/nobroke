import { strict as assert } from "node:assert";
import test from "node:test";
import { parseCommand } from "./command.ts";

/**
 * Golden phrasings for the deterministic command layer: the copilot's fast
 * path. Every row is a real way an Indian user words an intent. If a change
 * to the grammar breaks one of these, the fast path silently degrades to an
 * AI round trip — this suite makes that loud instead.
 */
const YEAR = 2026;

const GOLDENS: Array<[string, Record<string, unknown> | null]> = [
  // add a goal
  ["add a car goal", { kind: "addGoal", goalId: "car" }],
  ["i want to buy a house", { kind: "addGoal", goalId: "home" }],
  ["save for my wedding", { kind: "addGoal", goalId: "wedding" }],
  ["planning for early retirement", { kind: "addGoal", goalId: "fire" }],
  ["set up an emergency fund goal", { kind: "addGoal", goalId: "emergency" }],
  ["add a goal to pay off my education loan", { kind: "addGoal", goalId: "loan" }],
  ["save for my parents", { kind: "addGoal", goalId: "parents" }],
  ["add a kid's college goal", { kind: "addGoal", goalId: "child" }],
  // remove a goal
  ["remove the travel goal", { kind: "removeGoal", goalId: "travel" }],
  ["drop the gadget", { kind: "removeGoal", goalId: "gadget" }],
  ["cancel my business goal", { kind: "removeGoal", goalId: "business" }],
  // monthly pool
  ["invest 30k a month", { kind: "setPool", amount: 30000 }],
  ["i can put away ₹25,000 per month", { kind: "setPool", amount: 25000 }],
  ["monthly sip 40000", { kind: "setPool", amount: 40000 }],
  ["i can contribute 1.5 lakh monthly", { kind: "setPool", amount: 150000 }],
  // cash
  ["i have 5 lakh in the bank", { kind: "setCash", amount: 500000 }],
  ["my savings are 2.5 lakh", { kind: "setCash", amount: 250000 }],
  ["₹80,000 cash sitting idle", { kind: "setCash", amount: 80000 }],
  // targets
  ["set home target to ₹60L", { kind: "setTarget", goalId: "home", amount: 6000000 }],
  ["wedding budget 12 lakh", { kind: "setTarget", goalId: "wedding", amount: 1200000 }],
  ["car will cost 9 lakh", { kind: "setTarget", goalId: "car", amount: 900000 }],
  ["education needs 25 lakhs", { kind: "setTarget", goalId: "education", amount: 2500000 }],
  // timelines
  ["home in 6 years", { kind: "setYears", goalId: "home", years: 6 }],
  ["buy a house by 2032", { kind: "setYears", goalId: "home", years: 6 }],
  ["retire by 2040", { kind: "setYears", goalId: "fire", years: 14 }],
  ["wedding within 3 years", { kind: "setYears", goalId: "wedding", years: 3 }],
  // portfolio + split
  ["auto-balance my money", { kind: "autoSplit" }],
  ["split money across goals", { kind: "autoSplit" }],
  ["rebalance my portfolio", { kind: "recommendPortfolio" }],
  ["fix my mix", { kind: "recommendPortfolio" }],
  ["recommend funds for me", { kind: "recommendPortfolio" }],
  // fresh start
  ["start over", { kind: "newPlan" }],
  ["make a new plan", { kind: "newPlan" }],
  // polite-command openers stay commands
  ["can you add a car goal", { kind: "addGoal", goalId: "car" }],
  ["please remove the travel goal", { kind: "removeGoal", goalId: "travel" }],
  // must fall through to the AI, never a wrong command
  ["what is an index fund", null],
  ["should i rebalance my portfolio?", null],
  ["is 60 lakh enough for the home target?", null],
  ["can i buy a house in 6 years", null],
  ["should i buy bitcoin", null],
  ["how is ltcg taxed on equity funds", null],
  ["is my plan on track", null],
  ["explain the safety net goal to me", null],
];

test("command grammar goldens", () => {
  for (const [phrase, expected] of GOLDENS) {
    const got = parseCommand(phrase, YEAR);
    if (expected === null) {
      assert.equal(got, null, `"${phrase}" should fall through to the AI, got ${JSON.stringify(got)}`);
    } else {
      assert.ok(got, `"${phrase}" should parse, got null`);
      for (const [k, v] of Object.entries(expected)) {
        assert.deepEqual((got as unknown as Record<string, unknown>)[k], v, `"${phrase}" → ${k}`);
      }
    }
  }
});
