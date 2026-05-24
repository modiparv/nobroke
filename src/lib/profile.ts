import type { CityTier, CostSensitivity, Goal, Profile } from "../types.js";

export function emptyProfile(): Profile {
  return {
    cityTier: null,
    employment: null,
    careerStage: null,
    rent: 0,
    emi: 0,
    takeHome: 0,
    existingSavings: 0,
  };
}

/** How much a city inflates a goal's cost, by the goal's sensitivity. */
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

/** Baseline monthly living cost excluding rent & EMI, by city. */
const LIVING_BASE: Record<CityTier, number> = { metro: 28000, tier1: 20000, tier2: 15000, tier3: 11000 };

export function estimatedLiving(p: Profile): number {
  return LIVING_BASE[p.cityTier ?? "tier2"];
}

/**
 * Infer a take-home estimate from the soft signals (city, employment, stage)
 * BEFORE asking the number directly — the "first date" approach.
 */
export function inferIncome(p: Profile): number {
  const stageBase = p.careerStage === "starting" ? 45000 : p.careerStage === "growing" ? 95000 : p.careerStage === "stable" ? 170000 : 70000;
  const empMult = p.employment === "self_employed" ? 1.15 : p.employment === "freelancer" ? 0.9 : p.employment === "student" ? 0.4 : 1;
  const cityMult = p.cityTier === "metro" ? 1.3 : p.cityTier === "tier1" ? 1.1 : p.cityTier === "tier3" ? 0.8 : 0.95;
  return Math.round((stageBase * empMult * cityMult) / 1000) * 1000;
}

/** Monthly money left after rent, EMIs and estimated living costs. */
export function monthlySurplus(p: Profile): number {
  return Math.max(0, p.takeHome - p.rent - p.emi - estimatedLiving(p));
}

/** Suggested monthly investment — most of the surplus, with a buffer left behind. */
export function suggestedSip(p: Profile): number {
  const sip = monthlySurplus(p) * 0.65;
  return Math.max(1000, Math.round(sip / 500) * 500);
}

export const CITY_LABELS: Record<CityTier, string> = {
  metro: "Metro (Mumbai, Delhi, Bengaluru…)",
  tier1: "Tier 1 city",
  tier2: "Tier 2 city",
  tier3: "Tier 3 / town",
};
