import { strict as assert } from "node:assert";
import test from "node:test";
import { amountsINR, parseCommand } from "./command.ts";

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
  // the way students and teens actually type: model numbers, durations and
  // counts are never amounts; a year sets the date; months round to years
  ["iphone 16 for 80k", { kind: "setTarget", goalId: "gadget", amount: 80000 }],
  ["macbook m3 for 1.2 lakh", { kind: "setTarget", goalId: "gadget", amount: 120000 }],
  ["goa trip with 4 friends, 20k each", { kind: "setTarget", goalId: "travel", amount: 20000 }],
  ["bike for 90k", { kind: "setTarget", goalId: "bike", amount: 90000 }],
  ["activa for 80k", { kind: "setTarget", goalId: "bike", amount: 80000 }],
  ["college fees 2 lakh", { kind: "setTarget", goalId: "college", amount: 200000 }],
  ["upskill course for 30k", { kind: "setTarget", goalId: "course", amount: 30000 }],
  ["masters abroad 40 lakh", { kind: "setTarget", goalId: "education", amount: 4000000 }],
  ["emergency fund 25k", { kind: "setTarget", goalId: "emergency", amount: 25000 }],
  ["pay off my 40k credit card", { kind: "setTarget", goalId: "loan", amount: 40000 }],
  ["new phone in 2027", { kind: "setYears", goalId: "gadget", years: 1 }],
  ["get a bike in 2028", { kind: "setYears", goalId: "bike", years: 2 }],
  ["retire by 2045", { kind: "setYears", goalId: "fire", years: 19 }],
  ["scooter in 2 years", { kind: "setYears", goalId: "bike", years: 2 }],
  ["goa trip in 8 months", { kind: "setYears", goalId: "travel", years: 1 }],
  ["trip in 3 months", { kind: "setYears", goalId: "travel", years: 1 }],
  ["wedding in 18 months", { kind: "setYears", goalId: "wedding", years: 2 }],
  ["invest 2000 a month", { kind: "setPool", amount: 2000 }],
  ["save 500 a month", { kind: "setPool", amount: 500 }],
  ["i can put ₹300 a month", { kind: "setPool", amount: 300 }],
  ["i have 12k in the bank", { kind: "setCash", amount: 12000 }],
  // never a wrong command: small bare numbers, two amounts, income or spending
  ["put 300 a month", null],
  ["laptop 70k and trip 20k", null],
  ["i get 8000 pocket money a month", null],
  ["my parents give me 5000 a month", null],
  ["spent 3000 on food this month", null],
  ["concert tickets 8k", null],
];

const AMOUNTS: Array<[string, number[]]> = [
  ["iphone 16 for 80k", [80000]],
  ["macbook m3 for 1.2 lakh", [120000]],
  ["goa trip in 8 months", []],
  ["new phone in 2027", []],
  ["invest 2000 a month", [2000]],
  ["2030 per month", [2030]],
  ["buy a house 2032", []],
  ["with 4 friends, 20k each", [20000]],
  ["laptop 70k and trip 20k", [70000, 20000]],
  ["rs. 1,50,000 in fds", [150000]],
  ["₹50L for the house", [5000000]],
  ["3000km road trip", []],
  ["16gb phone", []],
  ["on the 16th", []],
  ["10% of my salary", []],
  ["put 300 a month", []],
  ["₹300 a month", [300]],
];

test("amounts: only marked or large numbers are money", () => {
  for (const [phrase, expected] of AMOUNTS) {
    assert.deepEqual(amountsINR(phrase), expected, `"${phrase}"`);
  }
});

test("months round to whole years and the confirmation says so", () => {
  const eight = parseCommand("goa trip in 8 months", YEAR);
  assert.ok(eight && eight.kind === "setYears" && eight.note && /8 months rounds to 1 year/.test(eight.note));
  const twelve = parseCommand("goa trip in 12 months", YEAR);
  assert.ok(twelve && twelve.kind === "setYears" && twelve.years === 1 && !twelve.note);
});

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
