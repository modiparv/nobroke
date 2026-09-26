import { strict as assert } from "node:assert";
import test from "node:test";
import { MODEL_PORTFOLIOS } from "./portfolios.ts";
import { inPriority, onTrackCount, outlook, type PlanShape } from "./outlook.ts";
import type { PlanGoal } from "./types";

// Aarav, with his real prices: trip ₹20,000 in a year, laptop ₹70,000 in
// two, ₹28,000 in hand and ₹2,900 a month in a balanced mix.
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

const base: PlanShape = {
  goals: [laptop, trip, abroad],
  goalOrder: ["travel", "gadget", "education"],
  goalShares: null,
  monthlySip: 2900,
  capital: 28000,
  inflation: 0.06,
  allocation: MODEL_PORTFOLIOS.balanced.allocation,
};

test("the outlook lists goals in priority order with the plan's own verdicts", () => {
  const out = outlook(base);
  assert.deepEqual(
    out.map((o) => o.id),
    ["travel", "gadget", "education"],
  );
  // The trip is covered from savings, the laptop from the rest plus the
  // monthly amount, and study abroad is far out of reach: 2 of 3.
  assert.equal(out[0].level, "on_track");
  assert.equal(out[1].level, "on_track");
  assert.equal(out[2].level, "far_short");
  assert.equal(onTrackCount(out), 2);
  // A goal covered by savings alone takes nothing a month.
  assert.equal(out[0].monthly, 0);
  assert.ok(out[1].monthly > 0);
  // Every goal's numbers are real: a need, a projection, a gap.
  for (const o of out) {
    assert.ok(o.need > 0);
    assert.ok(o.projected >= 0);
    assert.equal(Math.sign(o.gap), o.level === "on_track" ? 1 : -1);
  }
});

test("more a month moves a short goal, and the preview says so before saving", () => {
  const before = outlook({ ...base, monthlySip: 500 });
  assert.equal(before[1].level !== "on_track", true, "with ₹500 a month the laptop is short");
  const after = outlook({ ...base, monthlySip: 2900 });
  assert.equal(after[1].level, "on_track");
  assert.ok(after[1].projected > before[1].projected);
});

test("more in the bank changes who is covered, with the split kept as pinned", () => {
  // Pinned shares stay put when only cash changes, as the store does.
  const pinned = { travel: 50, gadget: 50, education: 0 };
  const poor = outlook({ ...base, capital: 0, goalShares: pinned });
  const rich = outlook({ ...base, capital: 90000, goalShares: pinned });
  assert.ok(onTrackCount(rich) > onTrackCount(poor));
  // Pinned percentages are honoured to the rupee.
  assert.equal(rich[0].monthly, 1450);
  assert.equal(rich[1].monthly, 1450);
  assert.equal(rich[2].monthly, 0);
});

test("a goal reached before its date carries the month it is reached", () => {
  // The whole ₹20,000 a month pinned on the trip: it is done within a few
  // months, well before its date a year out.
  const out = outlook({ ...base, capital: 0, monthlySip: 20000, goalShares: { travel: 100, gadget: 0, education: 0 } });
  const t = out.find((o) => o.id === "travel")!;
  assert.equal(t.level, "on_track");
  assert.ok(t.reachedMonth !== null && t.reachedMonth < 12);
  // Saved money that covers a goal exactly by its date is on track, with no
  // earlier month claimed, and a goal that is short never claims one.
  const exact = outlook({ ...base, capital: 500000 });
  assert.equal(exact.find((o) => o.id === "travel")!.level, "on_track");
  assert.equal(exact.find((o) => o.id === "travel")!.reachedMonth, null);
  assert.equal(exact.find((o) => o.id === "education")!.reachedMonth, null);
});

test("a different mix is previewed on the same money", () => {
  const steady = outlook({ ...base, allocation: MODEL_PORTFOLIOS.steady.allocation });
  const bold = outlook({ ...base, allocation: MODEL_PORTFOLIOS.bold.allocation });
  const e = (xs: ReturnType<typeof outlook>) => xs.find((o) => o.id === "education")!.projected;
  assert.ok(e(bold) > e(steady), "a bolder mix projects more over five years");
});

test("priority order tolerates ids the order does not name, and unknown ids", () => {
  assert.deepEqual(
    inPriority([laptop, trip], ["travel", "ghost"]).map((g) => g.id),
    ["travel", "gadget"],
  );
  assert.deepEqual(outlook({ ...base, goals: [], goalOrder: [] }), []);
});
