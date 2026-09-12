import type { Allocation, RiskProfile } from "./types";
import { allocationTotal, bandWeights } from "./finance.ts";

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

/** The portfolio's style, in the words every Indian investor already knows
 *  from fund categories: Conservative, Balanced, Growth. Cut on the share of
 *  stocks. Never a riddle. */
export function mixLabel(alloc: Allocation): string {
  const total = allocationTotal(alloc);
  if (total <= 0) return "Not invested yet";
  const equityShare = bandWeights(alloc).equity / total;
  if (equityShare >= 0.65) return "Growth";
  if (equityShare <= 0.35) return "Conservative";
  return "Balanced";
}

/** Share of the portfolio in stocks, 0..1 (0 when nothing is invested). */
export function equityShare(alloc: Allocation): number {
  const total = allocationTotal(alloc);
  return total > 0 ? bandWeights(alloc).equity / total : 0;
}
