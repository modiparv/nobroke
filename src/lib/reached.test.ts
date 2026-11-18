import { strict as assert } from "node:assert";
import test from "node:test";
import { reachedMonth, reachedText } from "./reached.ts";

const NOV_2026 = new Date(2026, 10, 18);

test("a goal reached in N months names the calendar month", () => {
  assert.equal(reachedMonth(1, NOV_2026), "Dec 2026");
  assert.equal(reachedMonth(2, NOV_2026), "Jan 2027");
  assert.equal(reachedMonth(16, NOV_2026), "Mar 2028");
  assert.equal(reachedMonth(120, NOV_2026), "Nov 2036");
});

test("part of a month counts as the whole month, and never the past", () => {
  assert.equal(reachedMonth(0.2, NOV_2026), "Dec 2026");
  assert.equal(reachedMonth(15.01, NOV_2026), "Mar 2028");
  assert.equal(reachedMonth(0, NOV_2026), "Nov 2026");
  assert.equal(reachedMonth(-4, NOV_2026), "Nov 2026");
  assert.equal(reachedMonth(Number.NaN, NOV_2026), "Nov 2026");
});

test("the month does not depend on the day it is asked", () => {
  assert.equal(reachedMonth(1, new Date(2026, 0, 31)), "Feb 2026");
  assert.equal(reachedMonth(12, new Date(2027, 11, 31)), "Dec 2028");
});

test("money held today that already covers the goal says so", () => {
  assert.equal(reachedText(0, NOV_2026), "Covered already");
  assert.equal(reachedText(-1, NOV_2026), "Covered already");
  assert.equal(reachedText(16, NOV_2026), "Done by Mar 2028");
});
