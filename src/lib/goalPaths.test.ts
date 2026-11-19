import { strict as assert } from "node:assert";
import test from "node:test";
import { computePlan, projectionSeries, requiredCorpus, requiredSip } from "./finance.ts";
import {
  SHARE_CAP,
  boxesOverlap,
  coveredShare,
  niceTicks,
  placeLabels,
  shareAxis,
  shareLabel,
  sharePath,
  shortName,
  yearTicks,
  type Box,
  type LabelTarget,
} from "./goalPaths.ts";
import type { PlanInputs } from "./types";

const RETURN = 0.1;
const INFLATION = 0.06;
const goal = (over: Partial<PlanInputs> = {}): PlanInputs => ({
  targetToday: 1_000_000,
  horizonYears: 5,
  currentSavings: 200_000,
  monthlySip: 5_000,
  inflation: INFLATION,
  allocation: {},
  ...over,
});
const pathOf = (inputs: PlanInputs) => sharePath(projectionSeries(inputs, RETURN), inputs.targetToday, inputs.inflation);
const last = <T>(xs: T[]): T => xs[xs.length - 1];

test("a goal exactly covered ends at 100%", () => {
  const need = requiredCorpus(1_000_000, INFLATION, 5);
  const inputs = goal({ monthlySip: requiredSip(need, 200_000, RETURN, 5) });
  const end = last(pathOf(inputs)).share;
  assert.ok(Math.abs(end - 1) < 1e-9, `ends at ${end}`);
  assert.equal(shareLabel(end), "100%");
});

test("a goal with nothing saved and nothing going in stays at 0%", () => {
  const path = pathOf(goal({ currentSavings: 0, monthlySip: 0 }));
  assert.ok(path.length > 12);
  assert.ok(path.every((p) => p.share === 0));
  assert.equal(shareLabel(last(path).share), "0%");
});

test("shares never go negative", () => {
  // Money that should not exist (a negative balance) still reads as nothing covered.
  const path = pathOf(goal({ currentSavings: -50_000, monthlySip: 0 }));
  assert.ok(path.every((p) => p.share >= 0));
  assert.equal(coveredShare(-1, 100), 0);
  assert.equal(coveredShare(Number.NaN, 100), 0);
  // A goal that costs nothing is covered, as computePlan's progress has it.
  assert.equal(coveredShare(0, 0), 1);
});

test("the path starts with today's money against today's cost and ends on the plan's own progress", () => {
  const inputs = goal();
  const path = pathOf(inputs);
  assert.equal(path[0].year, 0);
  assert.equal(path[0].share, 200_000 / 1_000_000);
  // Same projection, same cost: the last point is projected ÷ needed.
  const points = projectionSeries(inputs, RETURN);
  assert.equal(last(path).share, last(points).value / requiredCorpus(1_000_000, INFLATION, 5));
  // A line that ends above 100% is on track, one that ends below is short.
  const plan = computePlan({ ...inputs, allocation: {} });
  assert.equal(plan.blendedReturn, 0);
  const flat = sharePath(plan.series, inputs.targetToday, inputs.inflation);
  assert.equal(last(flat).share >= 1, plan.onTrack);
  assert.equal(last(flat).share, plan.progress);
});

test("money that grows slower than prices loses ground", () => {
  const path = sharePath(projectionSeries(goal({ monthlySip: 0 }), 0.03), 1_000_000, INFLATION);
  assert.ok(last(path).share < path[0].share);
});

test("share labels round down and never hide a sliver", () => {
  assert.equal(shareLabel(0.996), "99%");
  assert.equal(shareLabel(1), "100%");
  assert.equal(shareLabel(0.9999999999), "100%");
  assert.equal(shareLabel(1.004), "100%");
  assert.equal(shareLabel(0.03), "3%");
  assert.equal(shareLabel(0.004), "Under 1%");
  assert.equal(shareLabel(0), "0%");
  assert.equal(shareLabel(-0.2), "0%");
  assert.equal(shareLabel(20), "2,000%");
});

test("the share axis always shows 100% and never grows past the cap", () => {
  const usual = shareAxis(1, 1.3);
  assert.deepEqual(usual.ticks, [0, 0.5, 1]);
  assert.equal(usual.top, 1.3);
  assert.equal(usual.capped, false);

  const ahead = shareAxis(1.6, 1.3);
  assert.deepEqual(ahead.ticks, [0, 0.5, 1, 1.5]);
  assert.ok(ahead.top > 1.6);

  const farAhead = shareAxis(20, 1.3);
  assert.equal(farAhead.capped, true);
  assert.equal(last(farAhead.ticks), SHARE_CAP);
  assert.ok(farAhead.top >= SHARE_CAP && farAhead.top < SHARE_CAP * 1.2);

  assert.deepEqual(shareAxis(0, 1.3).ticks, [0, 0.5, 1]);
  assert.deepEqual(shareAxis(Number.NaN).ticks, [0, 0.5, 1]);
});

test("the calendar-year ticks are whole years", () => {
  for (const [span, max] of [[1, 6], [2, 6], [2.5, 6], [5, 5], [8, 6], [15, 6], [20, 6], [20, 4], [25, 8], [40, 6], [0.5, 6]] as const) {
    const ticks = yearTicks(2026, span, max);
    assert.ok(ticks.length >= 1 && ticks.length <= Math.max(2, max), `${span} years gave ${ticks.length} ticks`);
    assert.equal(ticks[0].year, 2026);
    for (const t of ticks) {
      assert.ok(Number.isInteger(t.year), `${t.year} is not a whole year`);
      assert.ok(Number.isInteger(t.offset));
      assert.ok(t.offset >= 0 && t.offset <= span);
      assert.equal(t.year, 2026 + t.offset);
    }
    for (let i = 1; i < ticks.length; i++) assert.ok(ticks[i].year > ticks[i - 1].year);
  }
  assert.deepEqual(
    yearTicks(2026, 20, 6).map((t) => t.year),
    [2026, 2031, 2036, 2041, 2046],
  );
  assert.deepEqual(
    yearTicks(2026, 2, 6).map((t) => t.year),
    [2026, 2027, 2028],
  );
});

test("the last year on the axis is always labelled", () => {
  for (let span = 1; span <= 40; span++) {
    for (const max of [4, 5, 6, 8]) {
      const ticks = yearTicks(2026, span, max);
      assert.equal(ticks[ticks.length - 1].year, 2026 + span, `${span} years, ${max} ticks`);
      assert.ok(ticks.length <= max);
    }
  }
  // Seven years in steps of two: 2033 takes the place of 2032.
  assert.deepEqual(
    yearTicks(2026, 7, 5).map((t) => t.year),
    [2026, 2028, 2030, 2033],
  );
});

test("rupee ticks are round numbers in lakh and crore", () => {
  assert.deepEqual(niceTicks(10.2e7, 5), [2.5e7, 5e7, 7.5e7, 1e8]);
  assert.deepEqual(niceTicks(83_371, 4), [25_000, 50_000, 75_000]);
  assert.deepEqual(niceTicks(95.63e5, 4), [25e5, 50e5, 75e5]);
  assert.deepEqual(niceTicks(0), []);
  assert.deepEqual(niceTicks(Number.NaN), []);
  for (const max of [7, 950, 12_345, 6.4e5, 3.3e6, 9.9e8]) {
    const ticks = niceTicks(max, 4);
    assert.ok(ticks.length >= 1 && ticks.length <= 5, `${max} gave ${ticks.length} ticks`);
    assert.ok(ticks.every((t) => t > 0 && t <= max * 1.000001));
  }
});

test("long names are shortened for the chart", () => {
  assert.equal(shortName("Parents' care"), "Parents' care");
  assert.equal(shortName("A very long name someone typed for a goal").length, 22);
  assert.ok(shortName("A very long name someone typed for a goal").endsWith("…"));
});

// ---------- Names at the line ends ----------

const H = 18;
const R = 4.5;
const marksOf = (t: LabelTarget): Box[] => [t, ...(t.alt ?? [])].map((p) => ({ x: p.x - R, y: p.y - R, w: 2 * R, h: 2 * R }));

/** The promises the chart relies on: inside the bounds, clear of each other,
    clear of every other line's end marker, clear of the obstacles. */
function assertClean(targets: LabelTarget[], bounds: Box, obstacles: Box[] = []) {
  const placed = placeLabels(targets, { bounds, h: H, marker: R, obstacles });
  for (const p of placed) {
    assert.ok(p.box.x >= bounds.x && p.box.x + p.box.w <= bounds.x + bounds.w, `${p.id} leaves the sides`);
    assert.ok(p.box.y >= bounds.y && p.box.y + p.box.h <= bounds.y + bounds.h, `${p.id} leaves the top or bottom`);
    for (const o of obstacles) assert.ok(!boxesOverlap(p.box, o), `${p.id} touches an obstacle`);
    for (const t of targets) for (const m of marksOf(t)) assert.ok(!boxesOverlap(p.box, m), `${p.id} covers a mark of ${t.id}`);
    for (const q of placed) if (q !== p) assert.ok(!boxesOverlap(p.box, q.box), `${p.id} collides with ${q.id}`);
  }
  return placed;
}

// A 360px phone: the chart is 328px wide, the plot runs from x=44 to x=310.
const PHONE: Box = { x: 0, y: 0, w: 328, h: 250 };
const xAt = (fraction: number) => 44 + fraction * 266;

test("three goals on a 360px phone all get a name, none colliding (Rajesh)", () => {
  // Two goals end on the 100% line three years apart; retirement ends far right, near zero.
  const y100 = 60;
  const targets: LabelTarget[] = [
    { id: "parents", x: xAt(5 / 20), y: y100, w: 88 },
    { id: "child", x: xAt(8 / 20), y: y100, w: 118 },
    { id: "retire", x: xAt(1), y: 244, w: 80 },
  ];
  const zoneLabel: Box = { x: 50, y: 12, w: 122, h: 18 };
  const placed = assertClean(targets, PHONE, [zoneLabel]);
  assert.equal(placed.length, 3);
});

test("goals that end in the same year get separate names (Aarav)", () => {
  const targets: LabelTarget[] = [
    { id: "trip", x: xAt(0.5), y: 60, w: 52 },
    { id: "course", x: xAt(0.5), y: 86, w: 128 },
    { id: "laptop", x: xAt(1), y: 249, w: 136 },
  ];
  const placed = assertClean(targets, PHONE);
  assert.equal(placed.length, 3);
});

test("two lines ending on the very same point still get two names", () => {
  const targets: LabelTarget[] = [
    { id: "a", x: xAt(0.5), y: 60, w: 100 },
    { id: "b", x: xAt(0.5), y: 60, w: 100 },
  ];
  const placed = placeLabels(targets, { bounds: PHONE, h: H, marker: R });
  assert.equal(placed.length, 2);
  assert.ok(!boxesOverlap(placed[0].box, placed[1].box));
});

test("a name at the right edge is written leftward, inside the chart", () => {
  const [p] = assertClean([{ id: "only", x: xAt(1), y: 120, w: 120 }], PHONE);
  assert.equal(p.anchor, "end");
  assert.ok(p.x <= 328);
});

test("a name with room sits to the right of its line's end", () => {
  const [p] = placeLabels([{ id: "only", x: 100, y: 120, w: 80 }], { bounds: PHONE, h: H, marker: R });
  assert.equal(p.anchor, "start");
  assert.ok(p.x > 100);
  assert.equal(p.y, 120);
});

test("a name moves off a rule and off other lines when it can", () => {
  const target = { id: "only", x: 100, y: 120, w: 80 };
  const onRule = placeLabels([target], { bounds: PHONE, h: H, marker: R, rules: [120] });
  assert.ok(onRule[0].y < 120, "sits above the rule, not across it");
  // A line runs through the space to the right: the name goes above instead.
  const crossing = placeLabels([target], { bounds: PHONE, h: H, marker: R, lines: [[{ x: 100, y: 120 }, { x: 300, y: 120 }]] });
  assert.ok(crossing[0].y < 120);
});

test("a name can sit beside its goal's other mark when the line's end is crowded", () => {
  // Rupee view on a phone: three lines end low and close together, and
  // retirement's ring (what it needs) is far above its line's end.
  const targets: LabelTarget[] = [
    { id: "parents", x: 122, y: 246, w: 88, alt: [{ x: 122, y: 246 }] },
    { id: "child", x: 159, y: 231, w: 118, alt: [{ x: 159, y: 231 }] },
    { id: "retire", x: 306, y: 242, w: 82, alt: [{ x: 306, y: 38 }] },
  ];
  const connector = [{ x: 306, y: 242 }, { x: 306, y: 38 }];
  const placed = placeLabels(targets, { bounds: { x: 2, y: 2, w: 324, h: 246 }, h: H, marker: R, lines: [connector] });
  assert.equal(placed.length, 3);
  for (const p of placed) for (const q of placed) if (p !== q) assert.ok(!boxesOverlap(p.box, q.box));
  // No name is pushed up to a second row, away from every mark of its goal.
  for (const p of placed) {
    const t = targets.find((it) => it.id === p.id)!;
    const near = [t, ...(t.alt ?? [])].some((m) => Math.abs(p.y - m.y) <= R + 4 + H);
    assert.ok(near, `${p.id} floats away from its marks`);
  }
  assert.ok(placed.find((p) => p.id === "retire")!.y < 100, "retirement is named at its ring");
});

test("a crowded chart can refuse places that sit on a line", () => {
  // The only free places are across a line: with a cost limit the name is left off.
  const target = { id: "only", x: xAt(1), y: 120, w: 120 };
  const fence = [
    [{ x: 0, y: 100 }, { x: 328, y: 100 }],
    [{ x: 0, y: 140 }, { x: 328, y: 140 }],
    [{ x: 0, y: 80 }, { x: 328, y: 80 }],
    // Its own line, arriving level from the left.
    [{ x: 0, y: 120 }, { x: 300, y: 120 }],
  ];
  assert.equal(placeLabels([target], { bounds: PHONE, h: H, marker: R, lines: fence }).length, 1);
  assert.equal(placeLabels([target], { bounds: PHONE, h: H, marker: R, lines: fence, maxCost: 11 }).length, 0);
});

test("when there is no room, names are left off rather than drawn over each other", () => {
  const tiny: Box = { x: 0, y: 0, w: 120, h: 40 };
  const targets: LabelTarget[] = Array.from({ length: 8 }, (_, i) => ({ id: `g${i}`, x: 20 + i * 10, y: 20, w: 90 }));
  const placed = assertClean(targets, tiny);
  assert.ok(placed.length < targets.length);
});

test("many goals: every placed name is clean, and the search finishes", () => {
  const y = [60, 60, 60, 90, 150, 200, 244, 244];
  const targets: LabelTarget[] = y.map((py, i) => ({ id: `g${i}`, x: xAt((i + 1) / 8), y: py, w: 90 + (i % 3) * 20 }));
  const started = Date.now();
  const placed = assertClean(targets, PHONE);
  assert.ok(placed.length >= 4, `only ${placed.length} placed`);
  assert.ok(Date.now() - started < 1000);
});
