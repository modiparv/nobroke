import { strict as assert } from "node:assert";
import test from "node:test";
import { blendedReturn, projectionSeries } from "./finance.ts";
import { formatINR } from "./format.ts";
import {
  HERO_EXAMPLES,
  HERO_GROWTH,
  HERO_LINE_STEPS,
  heroExampleFigures,
  heroFigures,
  heroLabel,
  heroLines,
  heroYears,
} from "./heroExample.ts";
import { MODEL_PORTFOLIOS } from "./portfolios.ts";

const student = HERO_EXAMPLES[0];
const family = HERO_EXAMPLES[1];

test("the arithmetic gives the figures the hero printed for ₹25,000 a month", () => {
  // The old hero, typed by hand: "₹2.0Cr together by 2046 · put in ₹60.0L · growth ₹1.4Cr".
  const f = heroFigures(25000, 20, 2026);
  assert.equal(f.endYear, 2046);
  assert.equal((f.putIn / 1e5).toFixed(1), "60.0");
  assert.equal((f.growth / 1e7).toFixed(1), "1.4");
  assert.equal((f.total / 1e7).toFixed(1), "2.0");
});

test("the figures are the engine's own projection, and they add up", () => {
  for (const [monthly, years] of [
    [3000, 4],
    [37000, 20],
    [25000, 20],
  ]) {
    const f = heroFigures(monthly, years, 2026);
    const series = projectionSeries(
      { targetToday: 0, horizonYears: years, currentSavings: 0, monthlySip: monthly, inflation: 0, allocation: {} },
      HERO_GROWTH,
    );
    assert.equal(f.total, Math.round(series[series.length - 1].value));
    assert.equal(f.putIn, monthly * 12 * years);
    assert.equal(f.putIn + f.growth, f.total);
    assert.ok(f.growth > 0);
  }
});

test("the growth assumed is the Balanced starting mix's, to one decimal", () => {
  const balanced = blendedReturn(MODEL_PORTFOLIOS.balanced.allocation);
  assert.ok(Math.abs(balanced - HERO_GROWTH) < 0.0005, `Balanced assumes ${balanced}, the example ${HERO_GROWTH}`);
});

test("the toggle labels are the brief's, built from the amounts the sums use", () => {
  assert.deepEqual(HERO_EXAMPLES.map(heroLabel), ["Student · ₹3,000 a month", "Family · ₹37,000 a month"]);
});

test("each example runs to its last goal, and prints these amounts", () => {
  assert.equal(heroYears(student.goals), 4);
  const s = heroExampleFigures(student, 2026);
  assert.deepEqual([s.years, s.endYear], [4, 2030]);
  assert.deepEqual([formatINR(s.putIn), formatINR(s.growth), formatINR(s.total)], ["₹1.44 L", "₹35,176", "₹1.79 L"]);

  assert.equal(heroYears(family.goals), 20);
  const f = heroExampleFigures(family, 2026);
  assert.deepEqual([f.years, f.endYear], [20, 2046]);
  assert.deepEqual([formatINR(f.putIn), formatINR(f.growth), formatINR(f.total)], ["₹88.8 L", "₹2.1 Cr", "₹2.99 Cr"]);
});

test("goal names fit at the end of a line on a small phone", () => {
  for (const e of HERO_EXAMPLES) {
    assert.equal(e.goals.length, 3);
    for (const g of e.goals) assert.ok(g.name.length <= 15, `${g.name} is too long for a 360px chart`);
  }
});

test("every line starts where the others start and ends at its own year", () => {
  for (const e of HERO_EXAMPLES) {
    const lines = heroLines(e.goals, 2026);
    const span = heroYears(e.goals);
    assert.deepEqual(
      lines.map((l) => l.year),
      [...e.goals].sort((a, b) => a.years - b.years).map((g) => 2026 + g.years),
    );
    lines.forEach((l, i) => {
      assert.equal(l.points.length, HERO_LINE_STEPS + 1);
      assert.deepEqual(l.points[0], [0, 0]);
      const [x, y] = l.points[l.points.length - 1];
      const years = l.year - 2026;
      assert.ok(Math.abs(x - years / span) < 1e-9, `${l.name} ends at x ${x}`);
      assert.ok(y > 0 && y <= 1);
      // Rising all the way, left to right.
      for (let k = 1; k < l.points.length; k++) {
        assert.ok(l.points[k][0] > l.points[k - 1][0]);
        assert.ok(l.points[k][1] > l.points[k - 1][1]);
      }
      // A later goal ends further right and higher, with room for a label between.
      if (i > 0) {
        const [px, py] = lines[i - 1].points[HERO_LINE_STEPS];
        assert.ok(x - px >= 0.2, `${l.name} ends too close to ${lines[i - 1].name} in time to label both`);
        assert.ok(y - py >= 0.25, `${l.name} ends too close to ${lines[i - 1].name} in height to label both`);
      }
    });
  }
});

/** A line's height at x, or null past its end. */
function heightAt(points: Array<[number, number]>, x: number): number | null {
  if (x > points[points.length - 1][0] + 1e-9) return null;
  for (let k = 1; k < points.length; k++) {
    const [x0, y0] = points[k - 1];
    const [x1, y1] = points[k];
    if (x <= x1 + 1e-9) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return points[points.length - 1][1];
}

test("lines never cross: a nearer goal's line stays above a further one's", () => {
  for (const e of HERO_EXAMPLES) {
    const lines = heroLines(e.goals, 2026);
    for (let i = 1; i < lines.length; i++) {
      const near = lines[i - 1].points;
      const far = lines[i].points;
      for (let step = 1; step <= 40; step++) {
        const x = (near[near.length - 1][0] * step) / 40;
        const a = heightAt(near, x);
        const b = heightAt(far, x);
        assert.ok(a !== null && b !== null && a > b, `${lines[i].name} crosses ${lines[i - 1].name} at x ${x}`);
      }
    }
  }
});

test("a line's bend is the real shape of monthly money growing", () => {
  // Halfway through twenty years the money is well under half of where it
  // ends; halfway through one year it is close to half.
  const far = heroLines([{ name: "Far", years: 20 }], 2026)[0].points;
  const near = heroLines([{ name: "Near", years: 1 }], 2026)[0].points;
  const mid = HERO_LINE_STEPS / 2;
  const series = projectionSeries(
    { targetToday: 0, horizonYears: 20, currentSavings: 0, monthlySip: 1, inflation: 0, allocation: {} },
    HERO_GROWTH,
  );
  assert.ok(Math.abs(far[mid][1] / far[HERO_LINE_STEPS][1] - series[120].value / series[240].value) < 1e-9);
  assert.ok(far[mid][1] / far[HERO_LINE_STEPS][1] < 0.3);
  assert.ok(near[mid][1] / near[HERO_LINE_STEPS][1] > 0.47);
});
