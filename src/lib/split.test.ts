import { strict as assert } from "node:assert";
import test from "node:test";
import { projectionSeries, requiredCorpus } from "./finance.ts";
import { coveringCapital, splitCapital, splitMonthly } from "./split.ts";
import type { PlanGoal } from "./types";

// Aarav: ₹28,000 saved, ₹2,900 a month, a portfolio pacing 10.4% a year,
// 6% inflation. His real prices: trip ₹20,000 in a year, laptop ₹70,000
// in two, and study abroad far beyond both.
const RETURN = 0.104;
const INFLATION = 0.06;
const goal = (id: string, targetToday: number, horizonYears: number): PlanGoal => ({
  id,
  name: id,
  emoji: "",
  targetToday,
  horizonYears,
  tenureConfirmed: true,
});
const trip = goal("travel", 20000, 1);
const laptop = goal("gadget", 70000, 2);
const abroad = goal("education", 5200000, 5);
const goals = [laptop, trip, abroad];
const order = ["travel", "gadget", "education"];

/** What one goal reaches under the split, by the engine's own projection. */
function outcome(g: PlanGoal, capital: Record<string, number>, shares: Record<string, number>, monthlySip: number) {
  const inputs = {
    targetToday: g.targetToday,
    horizonYears: g.horizonYears,
    currentSavings: capital[g.id],
    monthlySip: (monthlySip * (shares[g.id] ?? 0)) / 100,
    inflation: INFLATION,
    allocation: {},
  };
  const series = projectionSeries(inputs, RETURN);
  const projected = series[series.length - 1].value;
  const need = requiredCorpus(g.targetToday, INFLATION, g.horizonYears);
  return { projected, need, onTrack: projected >= need };
}

test("saved money covers the nearest goal first, only up to what it needs", () => {
  const cover = coveringCapital(trip, INFLATION, RETURN);
  // ₹21,200 by next year, discounted at the portfolio's pace: about ₹19,100.
  assert.ok(cover > 18500 && cover < 19500, `cover ${cover}`);
  const capital = splitCapital(goals, order, 28000, INFLATION, RETURN);
  assert.equal(capital.travel, cover);
  assert.equal(capital.gadget, 28000 - cover);
  assert.equal(capital.education, 0);
});

test("the monthly pool goes by what remains: the covered trip takes nothing, the laptop is on track", () => {
  const capital = splitCapital(goals, order, 28000, INFLATION, RETURN);
  const shares = splitMonthly(goals, order, 2900, capital, INFLATION, RETURN);
  assert.equal(shares.travel, 0);
  assert.ok(shares.gadget > 0 && shares.education > 0);
  assert.ok(Math.abs(shares.travel + shares.gadget + shares.education - 100) < 1e-6);

  const tripOut = outcome(trip, capital, shares, 2900);
  assert.equal(tripOut.onTrack, true, "covered from savings with ₹0 a month");
  const laptopOut = outcome(laptop, capital, shares, 2900);
  assert.equal(laptopOut.onTrack, true, "the laptop is on track");
  assert.equal(outcome(abroad, capital, shares, 2900).onTrack, false);
  // The engine's own arithmetic: the laptop clears the ₹78,652 it needs by its date.
  assert.equal(Math.round(laptopOut.need), 78652);
});

test("the covered trip is not over-funded the way it was when capital followed monthly shares", () => {
  const capital = splitCapital(goals, order, 28000, INFLATION, RETURN);
  const shares = splitMonthly(goals, order, 2900, capital, INFLATION, RETURN);
  const tripOut = outcome(trip, capital, shares, 2900);
  assert.ok(tripOut.projected < tripOut.need * 1.001, `reaches ${tripOut.projected} for a need of ${tripOut.need}`);
});

test("more savings than every goal needs: the extra is spread by size, never hidden", () => {
  const small = [goal("travel", 20000, 1), goal("gadget", 30000, 1)];
  const capital = splitCapital(small, ["travel", "gadget"], 100000, INFLATION, RETURN);
  assert.ok(Math.abs(capital.travel + capital.gadget - 100000) < 1e-6);
  assert.ok(capital.gadget > capital.travel);
  const shares = splitMonthly(small, ["travel", "gadget"], 1000, capital, INFLATION, RETURN);
  assert.equal(shares.travel, 50);
  assert.equal(shares.gadget, 50);
});

test("a pool that covers every need is shared in proportion to need; a pool of nothing still says who needs what", () => {
  const capital = splitCapital(goals, order, 0, INFLATION, RETURN);
  const rich = splitMonthly(goals, order, 500000, capital, INFLATION, RETURN);
  assert.ok(rich.education > rich.gadget && rich.gadget > rich.travel);
  const none = splitMonthly(goals, order, 0, capital, INFLATION, RETURN);
  assert.ok(Math.abs(none.travel + none.gadget + none.education - 100) < 1e-6);
});

test("goals the order does not name still get a place, after the ordered ones", () => {
  const capital = splitCapital(goals, ["gadget"], 28000, INFLATION, RETURN);
  assert.ok(capital.gadget > 0);
  assert.equal(Object.keys(capital).length, 3);
});
