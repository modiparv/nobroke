import { strict as assert } from "node:assert";
import test from "node:test";
import { computePlan, requiredCorpus } from "./finance.ts";
import { cleanTarget, goalOptions, reachableHorizon } from "./options.ts";
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

test("targets round down to a clean step for their size", () => {
  assert.equal(cleanTarget(22641), 22000);
  assert.equal(cleanTarget(7420), 7000);
  assert.equal(cleanTarget(456780), 450000);
  assert.equal(cleanTarget(2345678), 2300000);
  assert.equal(cleanTarget(0), 0);
});
