import { strict as assert } from "node:assert";
import test from "node:test";
import { onTrackMessage, reachFigure, shortMessage } from "./verdict.ts";

const plain = (s: string) => s.replace(/ /g, " ");

test("a goal funded to the rupee does not claim ₹1 more than needed", () => {
  assert.equal(plain(onTrackMessage({ projectedCorpus: 21201, requiredCorpus: 21200, gap: 1, months: 12, blendedReturn: 0.1 })), "You'll reach the ₹21,200 you need.");
  assert.equal(plain(onTrackMessage({ projectedCorpus: 1539001, requiredCorpus: 1539000, gap: 1, months: 12, blendedReturn: 0.1 })), "You'll reach the ₹15.39 L you need.");
});

test("a real surplus is still stated", () => {
  assert.equal(
    plain(onTrackMessage({ projectedCorpus: 120000, requiredCorpus: 100000, gap: 20000, months: 12, blendedReturn: 0.1 })),
    "You'll reach ₹1.2 L. That's ₹20,000 more than the ₹1 L you need.",
  );
});

test("a goal with no money yet does not repeat the monthly figure as a total", () => {
  assert.equal(
    plain(shortMessage({ projectedCorpus: 0, gap: -78652 }, 0, 3020)),
    "You'll reach ₹0. That's ₹78,652 short. ₹3,020 more a month would close the gap.",
  );
});

test("a goal that already gets money shows the extra and the total", () => {
  assert.equal(
    plain(shortMessage({ projectedCorpus: 500000, gap: -100000 }, 2000, 3020)),
    "You'll reach ₹5 L. That's ₹1 L short. ₹1,020 more a month (₹3,020 in total) would close the gap.",
  );
});

test("the amount a goal reaches is shown as the goal's own figure when the difference is rounding", () => {
  // The row reads "₹21,200 by 2027": it must not go on to say "will reach ₹21,201".
  assert.equal(reachFigure({ projectedCorpus: 21201, requiredCorpus: 21200, gap: 1, months: 12, blendedReturn: 0.1 }), 21200);
  // A real surplus and a shortfall are shown as they are.
  assert.equal(reachFigure({ projectedCorpus: 120000, requiredCorpus: 100000, gap: 20000, months: 12, blendedReturn: 0.1 }), 120000);
  assert.equal(reachFigure({ projectedCorpus: 99999, requiredCorpus: 100000, gap: -1, months: 12, blendedReturn: 0.1 }), 99999);
  assert.equal(reachFigure({ projectedCorpus: 0, requiredCorpus: 100000, gap: -100000, months: 12, blendedReturn: 0.1 }), 0);
});

test("a real surplus under 1% of the goal is shown as it is", () => {
  // "Put in more" then Save: the sheet said "Reaches ₹9.64 Cr", so the row must not say ₹9.62 Cr.
  assert.equal(reachFigure({ projectedCorpus: 96447644, requiredCorpus: 96214064, gap: 233580, months: 240, blendedReturn: 0.10375 }), 96447644);
  assert.equal(reachFigure({ projectedCorpus: 53480, requiredCorpus: 53000, gap: 480, months: 12, blendedReturn: 0.07 }), 53480);
});

test("a small goal given its whole-rupee monthly amount still shows one figure", () => {
  // ₹420 a month for two years overshoots ₹11,236 by ₹9 of rounding (0.08% of the goal).
  assert.equal(reachFigure({ projectedCorpus: 11245.15, requiredCorpus: 11236, gap: 9.15, months: 24, blendedReturn: 0.10375 }), 11236);
  assert.equal(plain(onTrackMessage({ projectedCorpus: 24234, requiredCorpus: 23966, gap: 268, months: 180, blendedReturn: 0.10375 })), "You'll reach the ₹23,966 you need.");
});
