import type { CityTier, CostSensitivity, Goal, Profile } from "./types";

export function emptyProfile(): Profile {
  return {
    cityTier: null,
    employment: null,
    careerStage: null,
    dependents: null,
    rent: 0,
    emi: 0,
    monthlySpend: 0,
    takeHome: 0,
    cashOnHand: 0,
    investedValue: 0,
  };
}

const CITY_GOAL_MULT: Record<CityTier, Record<CostSensitivity, number>> = {
  metro: { high: 1.6, medium: 1.25, none: 1 },
  tier1: { high: 1.3, medium: 1.15, none: 1 },
  tier2: { high: 1.0, medium: 1.0, none: 1 },
  tier3: { high: 0.85, medium: 0.92, none: 1 },
};

export function adjustedTarget(goal: Goal, cityTier: CityTier | null): number {
  const tier = cityTier ?? "tier2";
  return Math.round((goal.targetToday * CITY_GOAL_MULT[tier][goal.costSensitivity]) / 1000) * 1000;
}

const LIVING_BASE: Record<CityTier, number> = { metro: 28000, tier1: 20000, tier2: 15000, tier3: 11000 };
export function estimatedLiving(p: Profile): number {
  return LIVING_BASE[p.cityTier ?? "tier2"];
}

/** What is genuinely free each month. Uses the stated spend from the intake;
    falls back to a city-based estimate only if it was somehow never given. */
export function monthlySurplus(p: Profile): number {
  const living = p.monthlySpend > 0 ? p.monthlySpend : estimatedLiving(p);
  return Math.max(0, p.takeHome - p.rent - p.emi - living);
}

export function suggestedSip(p: Profile): number {
  const sip = monthlySurplus(p) * 0.65;
  return Math.max(1000, Math.round(sip / 500) * 500);
}
