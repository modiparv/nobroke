import { strict as assert } from "node:assert";
import test from "node:test";
import { GAP_LABEL, gapLevel, gapTone } from "./gap.ts";

const need = 1_000_000;
const short = (fraction: number) => ({ onTrack: false, gap: -need * fraction, requiredCorpus: need });

test("the level follows the size of the gap against what the goal needs", () => {
  assert.equal(gapLevel({ onTrack: true, gap: 50_000, requiredCorpus: need }), "on_track");
  assert.equal(gapLevel(short(0.01)), "little_short");
  assert.equal(gapLevel(short(0.149)), "little_short");
  assert.equal(gapLevel(short(0.15)), "short");
  assert.equal(gapLevel(short(0.5)), "short");
  assert.equal(gapLevel(short(0.501)), "far_short");
  // Rajesh: ₹54.69 L short of a ₹65 L college fund is more than half the goal.
  assert.equal(gapLevel({ onTrack: false, gap: -5_469_000, requiredCorpus: 6_500_000 * 1.06 ** 8 }), "far_short");
});

test("a goal that needs nothing yet is short cannot happen; if it does, it reads as far short", () => {
  assert.equal(gapLevel({ onTrack: false, gap: -1, requiredCorpus: 0 }), "far_short");
});

test("labels and tones", () => {
  assert.equal(GAP_LABEL.far_short, "Far short");
  assert.equal(GAP_LABEL.little_short, "A little short");
  assert.equal(gapTone("on_track"), "pos");
  assert.equal(gapTone("little_short"), "cau");
  assert.equal(gapTone("short"), "cau");
  assert.equal(gapTone("far_short"), "neg");
});
