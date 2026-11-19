import { strict as assert } from "node:assert";
import { test } from "node:test";
import { MODEL_PORTFOLIOS, equityShare, mixName } from "./portfolios.ts";

test("the mix is named as the Portfolio tab names it", () => {
  // An empty mix comes first: a plan with no goals carries a profile and no funds.
  assert.equal(mixName({}, "balanced"), "Not invested yet");
  assert.equal(mixName(MODEL_PORTFOLIOS.steady.allocation, "steady"), "Steady");
  assert.equal(mixName(MODEL_PORTFOLIOS.balanced.allocation, "balanced"), "Balanced");
  assert.equal(mixName(MODEL_PORTFOLIOS.bold.allocation, "bold"), "Bold");
  // Edited by hand: no ready-made name fits.
  assert.equal(mixName({ icici_nifty: 50, hdfc_corp_bond: 50 }, null), "Your own mix");
});

test("equityShare is a clean fraction, zero when empty", () => {
  assert.equal(equityShare({}), 0);
  assert.ok(Math.abs(equityShare({ icici_nifty: 15, hdfc_corp_bond: 70, icici_gold: 15 }) - 0.15) < 1e-9);
  assert.ok(Math.abs(equityShare({ mirae_hybrid: 100 }) - 0.65) < 1e-9);
});
