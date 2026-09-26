import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  CATEGORY_CODE,
  INTAKE_HOLDING_ID,
  INTAKE_HOLDING_NAME,
  UNSORTED_CATEGORY,
  UNSORTED_TYPE,
  categoryCode,
  refreshHoldingLabels,
} from "./holdings.ts";

test("the intake row from an older saved plan is relabelled", () => {
  const saved = [
    { id: INTAKE_HOLDING_ID, category: "Funds", type: "Portfolio", name: "Existing investments", amount: 1800000 },
    { id: "h_1", category: "Fixed income", type: "EPF", name: "My EPF", amount: 400000 },
  ];
  const out = refreshHoldingLabels(saved);
  assert.deepEqual(out[0], {
    id: INTAKE_HOLDING_ID,
    category: UNSORTED_CATEGORY,
    type: UNSORTED_TYPE,
    name: INTAKE_HOLDING_NAME,
    amount: 1800000,
  });
  // The person's own rows are untouched, and the amount is never changed.
  assert.deepEqual(out[1], saved[1]);
  // Already current: the same object comes back.
  assert.equal(refreshHoldingLabels(out)[0], out[0]);
});

test("the unsorted total never reads as Funds and has its own colour", () => {
  assert.ok(!/fund/i.test(UNSORTED_TYPE));
  assert.ok(!/portfolio/i.test(UNSORTED_TYPE));
  assert.ok(UNSORTED_CATEGORY in CATEGORY_CODE);
  assert.notDeepEqual(categoryCode(UNSORTED_CATEGORY), categoryCode("Cash"));
});
