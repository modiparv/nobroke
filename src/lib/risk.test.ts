import { strict as assert } from "node:assert";
import { test } from "node:test";
import { assessRiskAppetite, appetiteCeiling, capProfile, riskBandLabel, type RiskInputs } from "./risk.ts";
import { emptyProfile } from "./profile.ts";
import type { PlanGoal } from "./types.ts";

function goal(horizonYears: number): PlanGoal {
  return { id: `g${horizonYears}`, name: "G", emoji: "", targetToday: 1000000, horizonYears, tenureConfirmed: true };
}

function inputs(overrides: Partial<RiskInputs> = {}): RiskInputs {
  return {
    profile: emptyProfile(),
    goals: [],
    monthlyIncome: 0,
    monthlyExpenses: 0,
    currentSavings: 0,
    ...overrides,
  };
}

test("a secure single earner with cover and time scores far above a stretched parent", () => {
  const secure = assessRiskAppetite(
    inputs({
      profile: { ...emptyProfile(), careerStage: "starting", employment: "salaried", dependents: "none" },
      goals: [goal(12)],
      monthlyIncome: 100000,
      monthlyExpenses: 50000,
      currentSavings: 400000,
    }),
  );
  const stretched = assessRiskAppetite(
    inputs({
      profile: { ...emptyProfile(), careerStage: "stable", employment: "freelancer", dependents: "kids" },
      goals: [goal(2)],
      monthlyIncome: 100000,
      monthlyExpenses: 95000,
      currentSavings: 40000,
    }),
  );
  assert.ok(secure >= 80, `secure profile should score high, got ${secure}`);
  assert.ok(stretched <= 25, `stretched profile should score low, got ${stretched}`);
  assert.equal(riskBandLabel(secure), "Aggressive");
});

test("scores stay clamped and stepped in fives", () => {
  const v = assessRiskAppetite(inputs());
  assert.ok(v >= 5 && v <= 95);
  assert.equal(v % 5, 0);
});

test("appetite caps the horizon suggestion, never raises it", () => {
  assert.equal(capProfile("bold", 20), "steady");
  assert.equal(capProfile("bold", 50), "balanced");
  assert.equal(capProfile("bold", 80), "bold");
  assert.equal(capProfile("steady", 95), "steady", "high appetite must not add risk to a short horizon");
  assert.equal(appetiteCeiling(34), "steady");
  assert.equal(appetiteCeiling(35), "balanced");
  assert.equal(appetiteCeiling(65), "bold");
});
