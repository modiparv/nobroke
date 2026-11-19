import { strict as assert } from "node:assert";
import test from "node:test";
import { formatINR } from "./format.ts";

test("amounts are written in rupees, lakh and crore", () => {
  assert.equal(formatINR(950), "₹950");
  assert.equal(formatINR(37000), "₹37,000");
  assert.equal(formatINR(300000), "₹3 L");
  assert.equal(formatINR(1302000), "₹13.02 L");
  assert.equal(formatINR(30000000), "₹3 Cr");
  assert.equal(formatINR(-250000), "-₹2.5 L");
  assert.equal(formatINR(2100000, { compact: false }), "₹21,00,000");
});

test("an amount just under a crore is never written as 100 lakh", () => {
  assert.equal(formatINR(9_999_999), "₹1 Cr");
  assert.equal(formatINR(9_999_500), "₹1 Cr");
  assert.equal(formatINR(9_999_499), "₹99.99 L");
  assert.equal(formatINR(9_950_000), "₹99.5 L");
  assert.equal(formatINR(10_000_000), "₹1 Cr");
  for (const v of [9_990_000, 9_999_400, 9_999_499]) assert.doesNotMatch(formatINR(v), /^₹100 L$/);
});
