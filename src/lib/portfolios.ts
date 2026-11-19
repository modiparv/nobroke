import type { Allocation, RiskProfile } from "./types";
import { allocationTotal, bandWeights } from "./finance.ts";

/** Quick-start templates over funds. Each set of weights sums to 100. */
export const MODEL_PORTFOLIOS: Record<
  RiskProfile,
  { label: string; tagline: string; allocation: Allocation }
> = {
  steady: {
    label: "Steady",
    tagline: "Fewer ups and downs",
    allocation: { icici_liquid: 25, hdfc_corp_bond: 25, sbi_gilt: 20, icici_gold: 15, icici_nifty: 15 },
  },
  balanced: {
    label: "Balanced",
    tagline: "Some ups and downs",
    allocation: { icici_nifty: 25, parag_flexi: 15, mirae_hybrid: 20, hdfc_corp_bond: 20, icici_gold: 20 },
  },
  bold: {
    label: "Bold",
    tagline: "Big ups and downs",
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

/** The name of the person's mix, in the same words the Portfolio tab uses
 *  for its three ready-made mixes. A mix edited by hand has no ready-made
 *  name, so it is simply their own. One vocabulary on both tabs. */
export function mixName(alloc: Allocation, profile: RiskProfile | null): string {
  if (allocationTotal(alloc) <= 0) return "Not invested yet";
  const preset = profile && Object.prototype.hasOwnProperty.call(MODEL_PORTFOLIOS, profile) ? MODEL_PORTFOLIOS[profile] : null;
  return preset ? preset.label : "Your own mix";
}

/** Share of the portfolio in stocks, 0..1 (0 when nothing is invested). */
export function equityShare(alloc: Allocation): number {
  const total = allocationTotal(alloc);
  return total > 0 ? bandWeights(alloc).equity / total : 0;
}
