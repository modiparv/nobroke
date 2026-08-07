import { strict as assert } from "node:assert";
import { test } from "node:test";
import { monthEnds, scoreFromSeries, type SeriesPoint } from "./scoring.ts";

/** Build a month-end series from monthly growth factors, oldest first. */
function series(factors: number[], startNav = 100): SeriesPoint[] {
  const points: SeriesPoint[] = [];
  let nav = startNav;
  for (let i = 0; i < factors.length; i++) {
    nav *= factors[i];
    points.push({ t: Date.UTC(2020, i, 28), nav });
  }
  return points;
}

test("too little history scores null, never noise", () => {
  assert.equal(scoreFromSeries(series(Array(12).fill(1.01))), null);
});

test("a steady grower scores near the top with full components", () => {
  const s = scoreFromSeries(series(Array(61).fill(1.01)))!;
  assert.ok(s.score >= 90, `expected >=90, got ${s.score}`);
  assert.equal(s.components.consistency, 100);
  assert.equal(s.components.downside, 100);
  assert.equal(s.components.track, 100);
  assert.equal(s.grade, "Strong");
  assert.equal(s.monthsCovered, 60);
});

test("a deep crash is punished on the downside component", () => {
  // Two years up, then a 40 percent single-month fall, then flat.
  const factors = [...Array(24).fill(1.02), 0.6, ...Array(24).fill(1.0)];
  const s = scoreFromSeries(series(factors))!;
  assert.ok(s.components.downside <= 5, `drawdown ~40% should floor downside, got ${s.components.downside}`);
  const steady = scoreFromSeries(series(Array(49).fill(1.01)))!;
  assert.ok(s.score < steady.score, "crasher must rank below the steady fund");
});

test("choppy sideways funds rank below steady ones on consistency and ratio", () => {
  const choppy = scoreFromSeries(series(Array(30).fill(0).flatMap(() => [1.05, 0.952])))!;
  const steady = scoreFromSeries(series(Array(60).fill(1.008)))!;
  assert.ok(choppy.components.consistency < steady.components.consistency);
  assert.ok(choppy.components.riskAdjusted < steady.components.riskAdjusted);
  assert.ok(choppy.score < steady.score);
});

test("short but clean history is capped by the track component", () => {
  const young = scoreFromSeries(series(Array(19).fill(1.01)))!;
  assert.equal(young.monthsCovered, 18);
  assert.ok(young.components.track <= 30, `18 of 60 months -> low track, got ${young.components.track}`);
});

test("monthEnds keeps the last NAV of each month and drops junk", () => {
  const points = [
    { t: Date.UTC(2024, 0, 5), nav: 100 },
    { t: Date.UTC(2024, 0, 31), nav: 105 },
    { t: Date.UTC(2024, 1, 28), nav: 0 }, // junk NAV ignored
    { t: Date.UTC(2024, 1, 27), nav: 110 },
  ];
  const ends = monthEnds(points);
  assert.deepEqual(ends.map((p) => p.nav), [105, 110]);
});
