/** Pre-built model portfolios over products. Each set of weights sums to 100. */
export const MODEL_PORTFOLIOS = {
    conservative: {
        label: "Steady",
        tagline: "Protect first",
        allocation: { debt_fd: 25, debt_ppf: 15, bond_gsec: 20, bond_corp: 10, debt_liquid: 10, comm_gold: 10, mf_hybrid: 10 },
    },
    balanced: {
        label: "Balanced",
        tagline: "Grow with guardrails",
        allocation: { mf_index: 20, mf_flexi: 10, eq_large: 15, bond_corp: 15, bond_gsec: 10, debt_fd: 10, comm_gold: 10, mf_hybrid: 10 },
    },
    aggressive: {
        label: "Bold",
        tagline: "Maximize growth",
        allocation: { eq_large: 20, eq_mid: 15, eq_small: 10, mf_index: 15, mf_flexi: 15, eq_intl: 10, comm_gold: 10, bond_corp: 5 },
    },
};
/** Heuristic "AURA" allocation based on the goal's time horizon. */
export function autoAllocation(horizonYears) {
    let profile;
    if (horizonYears <= 3)
        profile = "conservative";
    else if (horizonYears <= 7)
        profile = "balanced";
    else
        profile = "aggressive";
    return { profile, allocation: { ...MODEL_PORTFOLIOS[profile].allocation } };
}
//# sourceMappingURL=portfolios.js.map