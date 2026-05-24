import type { Allocation, RiskProfile } from "./types";

/** Quick-start templates over funds. Each set of weights sums to 100. */
export const MODEL_PORTFOLIOS: Record<
  RiskProfile,
  { label: string; tagline: string; allocation: Allocation }
> = {
  steady: {
    label: "Steady",
    tagline: "Protect first",
    allocation: { icici_liquid: 25, hdfc_corp_bond: 25, sbi_gilt: 20, icici_gold: 15, icici_nifty: 15 },
  },
  balanced: {
    label: "Balanced",
    tagline: "Grow with guardrails",
    allocation: { icici_nifty: 25, parag_flexi: 15, mirae_hybrid: 20, hdfc_corp_bond: 20, icici_gold: 20 },
  },
  bold: {
    label: "Bold",
    tagline: "Maximize growth",
    allocation: { parag_flexi: 25, nippon_small: 20, icici_nifty: 20, quant_elss: 20, icici_gold: 15 },
  },
};

export function autoAllocation(horizonYears: number): { profile: RiskProfile; allocation: Allocation } {
  let profile: RiskProfile;
  if (horizonYears <= 3) profile = "steady";
  else if (horizonYears <= 7) profile = "balanced";
  else profile = "bold";
  return { profile, allocation: { ...MODEL_PORTFOLIOS[profile].allocation } };
}
