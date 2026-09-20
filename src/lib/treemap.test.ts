import { strict as assert } from "node:assert";
import { test } from "node:test";
import { squarify } from "./treemap.ts";

const items = (amounts: number[]) => amounts.map((amount, i) => ({ key: `g${i}`, amount }));
const area = (r: { w: number; h: number }) => r.w * r.h;
const aspect = (r: { w: number; h: number }) => Math.max(r.w / r.h, r.h / r.w);

test("tiles cover the rectangle exactly, in proportion, without overlap", () => {
  for (const amounts of [[60, 30, 10], [1, 1, 1], [50, 20, 15, 10, 5], [9, 8, 7, 6, 5, 4, 3, 2, 1, 1]]) {
    const rects = squarify(items(amounts), 0, 0, 100, 100);
    assert.equal(rects.length, amounts.length);
    const total = amounts.reduce((s, a) => s + a, 0);
    const covered = rects.reduce((s, r) => s + area(r), 0);
    assert.ok(Math.abs(covered - 10000) < 1e-6, `coverage ${covered}`);
    rects.forEach((r, i) => {
      const expected = (amounts[Number(r.key.slice(1))] / total) * 10000;
      assert.ok(Math.abs(area(r) - expected) < 1e-6, `tile ${i} area ${area(r)} vs ${expected}`);
      assert.ok(r.x >= -1e-9 && r.y >= -1e-9 && r.x + r.w <= 100 + 1e-6 && r.y + r.h <= 100 + 1e-6, "inside bounds");
    });
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const b = rects[j];
        const overlapW = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const overlapH = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        assert.ok(overlapW <= 1e-6 || overlapH <= 1e-6, `tiles ${i} and ${j} overlap`);
      }
    }
  }
});

test("many goals stay readable: no tile is a sliver", () => {
  // The glimpse lays out in a 200x100 space (the map renders about 2:1).
  // Ten goals at a realistic skew: every tile keeps a labelable height and
  // near-square shape, where slice-and-dice produced 20:1 strips.
  const ten = squarify(items([30, 20, 15, 10, 8, 6, 5, 3, 2, 1]), 0, 0, 200, 100);
  const worst = Math.max(...ten.map(aspect));
  assert.ok(worst < 3, `worst aspect ${worst.toFixed(2)}`);
  assert.ok(Math.min(...ten.map((r) => r.h)) >= 8, "smallest tile keeps 8% of the height");
  // A 5% goal beside a 43% one is the hard case: it becomes a wide band
  // under its neighbour, still tall enough for its label, never a needle.
  const three = squarify(items([52, 43, 5]), 0, 0, 200, 100);
  const small = three.find((r) => r.key === "g2")!;
  assert.ok(small.h >= 8 && small.w >= 40, `small tile ${small.w.toFixed(0)}x${small.h.toFixed(0)}`);
  const skew = squarify(items([60, 30, 10]), 0, 0, 200, 100);
  assert.ok(Math.max(...skew.map(aspect)) < 3.5);
});

test("zero and empty inputs are handled", () => {
  assert.deepEqual(squarify([], 0, 0, 100, 100), []);
  assert.deepEqual(squarify(items([0, 0]), 0, 0, 100, 100), []);
  const one = squarify(items([0, 7]), 10, 20, 50, 40);
  assert.deepEqual(one, [{ key: "g1", x: 10, y: 20, w: 50, h: 40 }]);
});
