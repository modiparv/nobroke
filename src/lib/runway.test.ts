import { strict as assert } from "node:assert";
import test from "node:test";
import { cashToFloor, runwayLabel, runwayMonths } from "./runway.ts";

test("runway is months of expenses the cash covers", () => {
  // Rajesh: ₹3 L in the bank, ₹1.03 L a month out (₹65,000 spend + ₹38,000 EMIs).
  const m = runwayMonths(300000, 103000);
  assert.ok(m !== null && Math.abs(m - 2.9126) < 0.001);
  assert.equal(runwayLabel(m), "2.9 months");
  assert.equal(runwayMonths(50000, 0), null);
  assert.equal(runwayLabel(null), "—");
  assert.equal(runwayMonths(-5, 1000), 0);
});

test("the label caps at a year and says month for exactly one", () => {
  assert.equal(runwayLabel(runwayMonths(1200000, 100000)), "12+ months");
  assert.equal(runwayLabel(runwayMonths(100000, 100000)), "1.0 month");
  assert.equal(runwayLabel(runwayMonths(22000, 3500)), "6.3 months");
});

test("cash to the floor is what brings three months within reach", () => {
  assert.equal(cashToFloor(300000, 103000), 9000);
  assert.equal(cashToFloor(1000000, 103000), 0);
  assert.equal(cashToFloor(0, 0), 0);
});
