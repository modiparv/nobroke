import { strict as assert } from "node:assert";
import { test } from "node:test";
import { equityShare, mixLabel } from "./portfolios.ts";

test("the portfolio style speaks fund-category words, cut on the share of stocks", () => {
  assert.equal(mixLabel({}), "Not invested yet");
  // All-debt and all-gold portfolios are conservative; hybrids count their stock half.
  assert.equal(mixLabel({ hdfc_corp_bond: 70, icici_gold: 30 }), "Conservative");
  assert.equal(mixLabel({ icici_nifty: 15, hdfc_corp_bond: 70, icici_gold: 15 }), "Conservative");
  assert.equal(mixLabel({ icici_nifty: 50, hdfc_corp_bond: 50 }), "Balanced");
  assert.equal(mixLabel({ parag_flexi: 60, mirae_hybrid: 20, icici_gold: 20 }), "Growth");
  assert.equal(mixLabel({ nippon_small: 100 }), "Growth");
});

test("equityShare is a clean fraction, zero when empty", () => {
  assert.equal(equityShare({}), 0);
  assert.ok(Math.abs(equityShare({ icici_nifty: 15, hdfc_corp_bond: 70, icici_gold: 15 }) - 0.15) < 1e-9);
  assert.ok(Math.abs(equityShare({ mirae_hybrid: 100 }) - 0.65) < 1e-9);
});
