import { strict as assert } from "node:assert";
import test from "node:test";
import { formatINR } from "./format.ts";
import { glueAmounts, inr } from "./glue.ts";

const NBSP = " ";

test("an amount in lakhs or crores keeps its unit on the same line", () => {
  assert.equal(inr(93300000), `₹9.33${NBSP}Cr`);
  assert.equal(inr(1302000), `₹13.02${NBSP}L`);
  assert.equal(inr(-250000), `-₹2.5${NBSP}L`);
});

test("an amount with no unit is left exactly as formatINR writes it", () => {
  assert.equal(inr(37000), formatINR(37000));
  assert.equal(inr(0), formatINR(0));
  assert.equal(inr(Number.NaN), formatINR(Number.NaN));
});

test("only the space before the unit changes, never the digits", () => {
  for (const v of [100000, 123456, 7980000, 10000000, 300000000]) {
    assert.equal(inr(v).replace(NBSP, " "), formatINR(v));
  }
});

test("every amount in a sentence is glued, and other words are not", () => {
  assert.equal(
    glueAmounts("You'll reach ₹82.48 L. That's ₹21.12 L short of ₹1.04 Cr by 2034."),
    `You'll reach ₹82.48${NBSP}L. That's ₹21.12${NBSP}L short of ₹1.04${NBSP}Cr by 2034.`,
  );
  assert.equal(glueAmounts("₹5,000 Later this year"), "₹5,000 Later this year");
  assert.equal(glueAmounts("₹37,000 a month"), "₹37,000 a month");
});
