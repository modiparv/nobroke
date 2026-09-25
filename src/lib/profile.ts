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

/** What is genuinely free each month: what comes in, minus rent, EMIs and
    the stated monthly spend. A confirmed ₹0 spend is ₹0: a student whose
    family covers everything has the whole stipend spare. */
export function monthlySurplus(p: Profile): number {
  return Math.max(0, p.takeHome - p.rent - p.emi - p.monthlySpend);
}

/** A starting monthly investment: about two thirds of what is spare, never
    more than is spare, in ₹100 steps below ₹5,000 and ₹500 steps above.
    ₹0 when nothing is spare; the plan says so rather than inventing ₹1,000. */
export function suggestedSip(p: Profile): number {
  const surplus = monthlySurplus(p);
  const raw = surplus * 0.65;
  const step = raw < 5000 ? 100 : 500;
  return Math.min(surplus, Math.round(raw / step) * step);
}

/** The emergency fund is six months of outgoings (rent, EMIs and spend), in
    ₹5,000 steps and never below ₹25,000: even someone whose family covers
    everything needs a buffer of their own. */
export const EMERGENCY_MONTHS = 6;
export const EMERGENCY_FLOOR = 25000;
export function emergencyTarget(p: Profile): number {
  const outgo = p.rent + p.emi + p.monthlySpend;
  return Math.max(EMERGENCY_FLOOR, Math.round((outgo * EMERGENCY_MONTHS) / 5000) * 5000);
}
