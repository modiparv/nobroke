/** Pre-built model portfolios. Each set of weights sums to 100. */
export const MODEL_PORTFOLIOS = {
    conservative: {
        label: "Conservative",
        tagline: "Capital protection first",
        allocation: { liquid: 30, debt_gilt: 30, debt_corp: 20, gold: 10, equity_large: 10 },
    },
    balanced: {
        label: "Balanced",
        tagline: "Growth with guardrails",
        allocation: { equity_large: 30, equity_mid: 10, equity_intl: 10, debt_corp: 25, debt_gilt: 15, gold: 10 },
    },
    aggressive: {
        label: "Aggressive",
        tagline: "Maximize long-run growth",
        allocation: { equity_large: 40, equity_mid: 25, equity_intl: 15, gold: 10, debt_corp: 10 },
    },
};
/** Heuristic "AI" allocation based on the goal's time horizon. */
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