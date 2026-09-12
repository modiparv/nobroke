import { strict as assert } from "node:assert";
import { test } from "node:test";
import { STAGES, coverageFrom, routeHeight, stageFor } from "./climb.ts";

test("coverage is the share of what the goals need that today's pace reaches, capped per goal", () => {
  assert.equal(coverageFrom([]), 0);
  assert.equal(coverageFrom([{ projected: 0, need: 100 }]), 0);
  assert.equal(coverageFrom([{ projected: 50, need: 100 }]), 0.5);
  // Overshooting one goal never pays for another.
  assert.equal(coverageFrom([{ projected: 300, need: 100 }, { projected: 0, need: 100 }]), 0.5);
  // Goals with nothing needed are ignored, never divide by zero.
  assert.equal(coverageFrom([{ projected: 10, need: 0 }]), 0);
  assert.ok(Math.abs(coverageFrom([{ projected: 25, need: 100 }, { projected: 100, need: 300 }]) - 0.3125) < 1e-9);
});

test("stages step at their thresholds and name the next one", () => {
  assert.equal(stageFor(0).stage.name, "Base camp");
  assert.equal(stageFor(0.149).stage.name, "Base camp");
  assert.equal(stageFor(0.15).stage.name, "Foothills");
  assert.equal(stageFor(0.4).stage.name, "Ridge");
  assert.equal(stageFor(0.7).stage.name, "High camp");
  assert.equal(stageFor(0.95).stage.name, "Summit");
  assert.equal(stageFor(1.5).stage.name, "Summit");
  assert.equal(stageFor(-1).stage.name, "Base camp");
  assert.equal(stageFor(0.5).next?.name, "High camp");
  assert.equal(stageFor(1).next, null);
  assert.equal(STAGES.length, 5);
});

test("the route runs from base to summit whatever the appetite, steady early and bold late", () => {
  for (const a of ["steady", "balanced", "bold"] as const) {
    assert.equal(routeHeight(0, a), 0);
    assert.equal(routeHeight(1, a), 1);
    assert.equal(routeHeight(-0.5, a), 0);
    assert.equal(routeHeight(2, a), 1);
  }
  assert.ok(routeHeight(0.5, "steady") > routeHeight(0.5, "balanced"));
  assert.ok(routeHeight(0.5, "balanced") > routeHeight(0.5, "bold"));
});
