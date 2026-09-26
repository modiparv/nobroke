import { strict as assert } from "node:assert";
import test from "node:test";
import { applyGoalCosts, goalCostKey, STEPS } from "./onboarding.ts";

test("the intake asks what each goal costs right after the goals are picked", () => {
  const goals = STEPS.findIndex((s) => s.kind === "goals");
  const costs = STEPS.findIndex((s) => s.kind === "costs");
  assert.ok(goals >= 0 && costs === goals + 1);
  assert.equal(STEPS[costs].stage, STEPS[goals].stage);
});

test("a price given in the intake replaces the estimate; a blank or a bad value keeps it", () => {
  const goals = [
    { id: "travel", targetToday: 200000 },
    { id: "gadget", targetToday: 100000 },
    { id: "education", targetToday: 5200000 },
  ];
  const answers = { [goalCostKey("travel")]: "20000", [goalCostKey("gadget")]: "", [goalCostKey("education")]: "abc", "cost:nope": "5" };
  const priced = applyGoalCosts(goals, answers);
  assert.equal(priced[0].targetToday, 20000);
  assert.equal(priced[1].targetToday, 100000);
  assert.equal(priced[2].targetToday, 5200000);
  assert.equal(applyGoalCosts(goals, { [goalCostKey("travel")]: "0" })[0].targetToday, 200000);
  assert.equal(applyGoalCosts(goals, { [goalCostKey("travel")]: "-5" })[0].targetToday, 200000);
  assert.equal(applyGoalCosts(goals, { [goalCostKey("travel")]: "70000.6" })[0].targetToday, 70001);
  // No answers at all: nothing changes.
  assert.deepEqual(applyGoalCosts(goals, {}), goals);
});
