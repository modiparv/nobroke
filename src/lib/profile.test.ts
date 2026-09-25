import { strict as assert } from "node:assert";
import test from "node:test";
import { emergencyTarget, emptyProfile, monthlySurplus, suggestedSip } from "./profile.ts";

// Two students from the audit: a ₹15k stipend with family covering every
// expense, and ₹8k a month with ₹3,500 of spending.
const riya = { ...emptyProfile(), takeHome: 15000, monthlySpend: 0 };
const aarav = { ...emptyProfile(), takeHome: 8000, monthlySpend: 3500 };
const salaried = { ...emptyProfile(), takeHome: 90000, rent: 20000, emi: 5000, monthlySpend: 30000 };

test("a confirmed ₹0 spend is ₹0: the whole stipend is spare", () => {
  assert.equal(monthlySurplus(riya), 15000);
  assert.equal(suggestedSip(riya), 10000);
});

test("the suggested investment fits small money and never exceeds what is spare", () => {
  assert.equal(monthlySurplus(aarav), 4500);
  assert.equal(suggestedSip(aarav), 2900);
  assert.equal(suggestedSip({ ...emptyProfile(), takeHome: 1300, monthlySpend: 1000 }), 200);
  assert.equal(suggestedSip({ ...emptyProfile(), takeHome: 1120, monthlySpend: 1000 }), 100);
  assert.equal(suggestedSip({ ...emptyProfile(), takeHome: 8000, rent: 8000 }), 0);
  assert.equal(suggestedSip(salaried), 23000);
});

test("the emergency fund is six months of outgoings, with a floor", () => {
  assert.equal(emergencyTarget(aarav), 25000);
  assert.equal(emergencyTarget(riya), 25000);
  assert.equal(emergencyTarget(salaried), 330000);
});
