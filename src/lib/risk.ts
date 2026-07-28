import type { PlanGoal, Profile, RiskProfile } from "./types";

/**
 * Risk appetite: assessed from the intake, owned by the user, respected by
 * every recommendation.
 *
 * The assessment is a transparent suitability rubric, the same shape a human
 * advisor scores in a first meeting: runway (career stage), income stability,
 * who depends on the income, emergency cover, how much of the income is
 * genuinely spare, and how far away the goals are. Deterministic and
 * explainable; no model.
 *
 * Appetite CAPS risk, it never adds it: a long horizon may suggest a bold
 * mix, but a conservative appetite holds the recommendation down. The
 * reverse is not applied, because a short horizon with an aggressive
 * appetite is still a short horizon.
 */

export interface RiskInputs {
  profile: Profile;
  goals: PlanGoal[];
  monthlyIncome: number;
  monthlyExpenses: number;
  currentSavings: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function assessRiskAppetite(i: RiskInputs): number {
  const p = i.profile;
  let score = 50;

  // Runway: early careers can sit through drawdowns.
  if (p.careerStage === "starting") score += 10;
  else if (p.careerStage === "growing") score += 5;

  // Income stability.
  if (p.employment === "salaried") score += 5;
  else if (p.employment === "freelancer" || p.employment === "student") score -= 5;

  // Responsibility.
  if (p.dependents === "none") score += 10;
  else if (p.dependents === "partner") score += 2;
  else if (p.dependents === "kids" || p.dependents === "parents") score -= 8;

  // Emergency cover in months of spending.
  const cover = i.monthlyExpenses > 0 ? i.currentSavings / i.monthlyExpenses : null;
  if (cover != null) {
    if (cover >= 6) score += 10;
    else if (cover >= 3) score += 5;
    else if (cover < 1) score -= 10;
    else score -= 3;
  }

  // Spare income: how much of what comes in is genuinely free.
  const surplusRatio = i.monthlyIncome > 0 ? (i.monthlyIncome - i.monthlyExpenses) / i.monthlyIncome : null;
  if (surplusRatio != null) {
    if (surplusRatio >= 0.4) score += 10;
    else if (surplusRatio >= 0.2) score += 5;
    else if (surplusRatio < 0.1) score -= 5;
  }

  // Time: the average goal horizon.
  if (i.goals.length > 0) {
    const avg = i.goals.reduce((a, g) => a + g.horizonYears, 0) / i.goals.length;
    if (avg >= 10) score += 10;
    else if (avg >= 6) score += 5;
    else if (avg <= 3) score -= 10;
  }

  return clamp(Math.round(score / 5) * 5, 5, 95);
}

export const RISK_BANDS = ["Conservative", "Cautious", "Balanced", "Growth", "Aggressive"] as const;

export function riskBandIndex(appetite: number): number {
  return clamp(Math.floor(appetite / 20), 0, 4);
}

export function riskBandLabel(appetite: number): (typeof RISK_BANDS)[number] {
  return RISK_BANDS[riskBandIndex(appetite)];
}

const PROFILE_ORDER: RiskProfile[] = ["steady", "balanced", "bold"];

/** The most aggressive mix an appetite permits. */
export function appetiteCeiling(appetite: number): RiskProfile {
  if (appetite < 35) return "steady";
  if (appetite < 65) return "balanced";
  return "bold";
}

/** Horizon suggests; appetite caps. */
export function capProfile(horizonProfile: RiskProfile, appetite: number): RiskProfile {
  const ceiling = appetiteCeiling(appetite);
  return PROFILE_ORDER[Math.min(PROFILE_ORDER.indexOf(horizonProfile), PROFILE_ORDER.indexOf(ceiling))];
}
