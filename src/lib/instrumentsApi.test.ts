import { strict as assert } from "node:assert";
import test from "node:test";
import { fundFromLiveScheme, savedLiveFund } from "./instrumentsApi.ts";

const detail = { code: "122639", name: "A Flexi Cap Fund - Direct Plan - Growth", category: "Equity Scheme - Flexi Cap Fund", fundHouse: "", nav: 80, navDate: null, cagr1y: 0.31, cagr3y: 0.2, cagr5y: 0.182 };

test("a fund saved with a plan reads back as the same fund", () => {
  const fund = fundFromLiveScheme(detail);
  assert.deepEqual(savedLiveFund(JSON.parse(JSON.stringify(fund))), fund);
});

test("a saved fund cannot carry its own growth rate", () => {
  // Plans come back from the server and from local storage: neither is trusted with the planning figures.
  const tampered = { ...fundFromLiveScheme(detail), expReturn: 0.9, volatility: 0, risk: "Low" };
  const read = savedLiveFund(tampered)!;
  assert.equal(read.expReturn, 0.12);
  assert.equal(read.volatility, 0.16);
  assert.equal(read.risk, "High");
});

test("anything that is not a search fund is dropped", () => {
  const fund = fundFromLiveScheme(detail);
  assert.equal(savedLiveFund(null), null);
  assert.equal(savedLiveFund("live_122639"), null);
  // A saved row must not be able to replace a built-in fund.
  assert.equal(savedLiveFund({ ...fund, id: "icici_nifty" }), null);
  assert.equal(savedLiveFund({ ...fund, id: "live_12x" }), null);
  assert.equal(savedLiveFund({ ...fund, name: "" }), null);
  assert.equal(savedLiveFund({ ...fund, assetClass: "crypto" }), null);
  assert.equal(savedLiveFund({ ...fund, assetClass: "toString" }), null);
});
