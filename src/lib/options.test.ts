import { strict as assert } from "node:assert";
import test from "node:test";
import { computePlan, requiredCorpus } from "./finance.ts";
import { GOAL_MAP } from "./goals.ts";
import { cleanTarget, educationNote, goalOptions, neededMonthly, reachableHorizon } from "./options.ts";
import type { PlanInputs } from "./types";

// A laptop a year away, ₹2,000 a month, nothing saved, no portfolio yet.
const laptop: PlanInputs = { targetToday: 100000, horizonYears: 1, currentSavings: 0, monthlySip: 2000, inflation: 0.06, allocation: {} };

test("a short goal gets three real moves: more monthly, a later year, a smaller target", () => {
  const r = computePlan(laptop);
  assert.equal(r.onTrack, false);
  const o = goalOptions(laptop, r);
  assert.equal(o.monthly, Math.ceil(r.requiredSip));
  assert.ok(o.year !== null && o.year > laptop.horizonYears, "a later year exists");
  // The later year is the first one at which the same pace is on track.
  assert.equal(computePlan({ ...laptop, horizonYears: o.year! }).onTrack, true);
  assert.equal(computePlan({ ...laptop, horizonYears: o.year! - 1 }).onTrack, false);
  // The smaller target is reachable by the original date, in today's money.
  assert.ok(o.target > 0 && o.target < laptop.targetToday);
  assert.ok(r.projectedCorpus >= requiredCorpus(o.target, laptop.inflation, laptop.horizonYears));
});

test("no money in means no later year; a goal on track has none either", () => {
  assert.equal(reachableHorizon({ ...laptop, monthlySip: 0 }), null);
  const easy = { ...laptop, monthlySip: 20000 };
  const r = computePlan(easy);
  assert.equal(r.onTrack, true);
  assert.equal(goalOptions(easy, r).year, null);
});

test("a date-fixed goal (a child's college year) is never offered a later year", () => {
  // Rajesh: ₹65 L for college in 8 years, ₹20,000 a month. Money or target are the moves.
  const college: PlanInputs = { targetToday: 6500000, horizonYears: 8, currentSavings: 0, monthlySip: 20000, inflation: 0.06, allocation: {} };
  const r = computePlan(college);
  assert.equal(r.onTrack, false);
  assert.equal(goalOptions(college, r, { dateFixed: true }).year, null);
  assert.ok(goalOptions(college, r, { dateFixed: true }).monthly > 0);
});

test("college fees fall due on a date: no later year is offered", () => {
  const fees: PlanInputs = { targetToday: 150000, horizonYears: 1, currentSavings: 0, monthlySip: 2000, inflation: 0.06, allocation: {} };
  const r = computePlan(fees);
  assert.equal(r.onTrack, false);
  assert.equal(GOAL_MAP.college.dateFixed, true);
  assert.equal(goalOptions(fees, r, { dateFixed: GOAL_MAP.college.dateFixed }).year, null);
});

test("education goals that are far short get one line of context, and only they do", () => {
  const line = "An education loan or scholarship can cover part of this.";
  assert.equal(educationNote("child", "far_short"), line);
  assert.equal(educationNote("college", "far_short"), line);
  assert.equal(educationNote("child", "short"), null);
  assert.equal(educationNote("child", "on_track"), null);
  assert.equal(educationNote("gadget", "far_short"), null);
  assert.equal(educationNote("education", "far_short"), null, "study abroad is not a fixed date and not fee-based");
});

test("a later year is offered only within five years of the goal's own date", () => {
  // At ₹1,500 a month the laptop is reachable, but nine years late: not a move, a different goal.
  const slow = { ...laptop, monthlySip: 1500 };
  const r = computePlan(slow);
  assert.equal(r.onTrack, false);
  const reachable = reachableHorizon(slow);
  assert.ok(reachable !== null && reachable - slow.horizonYears > 5, `reachable at ${reachable}`);
  assert.equal(goalOptions(slow, r).year, null);
  // Aarav's laptop at ₹2,000 a month is reachable within five years, so the move stays.
  const o = goalOptions(laptop, computePlan(laptop));
  assert.ok(o.year !== null && o.year - laptop.horizonYears <= 5);
});

test("the monthly needed rounds up to the rupee, once, for every surface", () => {
  // Rajesh's card read ₹53,969 in one place and ₹53,968 in another.
  assert.equal(neededMonthly({ requiredSip: 53968.2 }), 53969);
  assert.equal(neededMonthly({ requiredSip: 53968 }), 53968);
  const r = computePlan(laptop);
  assert.equal(goalOptions(laptop, r).monthly, neededMonthly(r));
});

test("targets round down to a clean step for their size", () => {
  assert.equal(cleanTarget(22641), 22000);
  assert.equal(cleanTarget(7420), 7000);
  assert.equal(cleanTarget(456780), 450000);
  assert.equal(cleanTarget(2345678), 2300000);
  assert.equal(cleanTarget(0), 0);
});
