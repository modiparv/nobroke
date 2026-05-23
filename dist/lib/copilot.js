import { allocationTotal, equityWeight, normalizedWeights } from "./finance.js";
import { ASSET_MAP } from "./assets.js";
import { formatINR, formatPct, formatYears } from "./format.js";
/** Rule-based "copilot" guidance. Ordered by importance; capped at 5. */
export function generateInsights(inputs, r) {
    const out = [];
    const weights = normalizedWeights(inputs.allocation);
    if (weights.length === 0) {
        return [
            {
                tone: "critical",
                icon: "🧩",
                title: "Build your portfolio",
                message: "Drag an asset into your portfolio — or pick a model — to see projections come alive.",
            },
        ];
    }
    // Headline: on track vs shortfall.
    if (r.onTrack) {
        out.push({
            tone: "positive",
            icon: "✅",
            title: "You're on track",
            message: `Projected ${formatINR(r.projectedCorpus)} clears your ${formatINR(r.requiredCorpus)} target — a ${formatINR(r.gap)} surplus.`,
        });
        if (r.goalReachedMonth !== null && r.goalReachedMonth < r.months) {
            out.push({
                tone: "positive",
                icon: "⏱️",
                title: "Ahead of schedule",
                message: `At this pace you cross the goal in ~${formatYears(r.goalReachedMonth / 12)} — about ${formatYears((r.months - r.goalReachedMonth) / 12)} early.`,
            });
        }
    }
    else {
        const extra = Math.max(0, r.requiredSip - inputs.monthlySip);
        out.push({
            tone: "warning",
            icon: "📉",
            title: "Shortfall ahead",
            message: `Projected ${formatINR(r.projectedCorpus)} is ${formatINR(Math.abs(r.gap))} short. Step your SIP up to ${formatINR(r.requiredSip)}/mo (+${formatINR(extra)}) to close the gap.`,
        });
    }
    // Risk vs horizon.
    const eq = equityWeight(inputs.allocation);
    if (inputs.horizonYears <= 3 && eq > 0.4) {
        out.push({
            tone: "warning",
            icon: "🎢",
            title: "Aggressive for a short goal",
            message: `${formatPct(eq, 0)} in equity with only ${formatYears(inputs.horizonYears)} left is risky — a dip could land right when you need the cash. Lean toward debt/liquid.`,
        });
    }
    else if (inputs.horizonYears >= 10 && eq < 0.4) {
        out.push({
            tone: "info",
            icon: "🌱",
            title: "Room to grow",
            message: `With ${formatYears(inputs.horizonYears)} on your side, ${formatPct(eq, 0)} equity is conservative. More equity has historically compounded faster over long horizons.`,
        });
    }
    // Concentration.
    const top = [...weights].sort((a, b) => b.weight - a.weight)[0];
    if (top && top.weight > 0.7) {
        out.push({
            tone: "info",
            icon: "🧺",
            title: "Concentrated bet",
            message: `${formatPct(top.weight, 0)} sits in ${ASSET_MAP[top.id]?.shortName ?? "one asset"}. Spreading across assets smooths the ride.`,
        });
    }
    // Allocation not balanced.
    const total = allocationTotal(inputs.allocation);
    if (Math.abs(total - 100) > 0.5) {
        out.push({
            tone: "info",
            icon: "⚖️",
            title: `Weights total ${Math.round(total)}%`,
            message: `Projections use normalized weights. Tap “Balance to 100%” for a clean split.`,
        });
    }
    // Inflation reality check.
    out.push({
        tone: "info",
        icon: "🔥",
        title: "Inflation does the math",
        message: `Your ${formatINR(inputs.targetToday)} goal will cost ${formatINR(r.requiredCorpus)} in ${formatYears(inputs.horizonYears)} at ${formatPct(inputs.inflation, 0)} inflation. NoBroke plans for the future price.`,
    });
    // Compounding nudge.
    const growth = r.projectedCorpus - r.totalInvested;
    if (growth > 0) {
        out.push({
            tone: "positive",
            icon: "🪄",
            title: "Compounding at work",
            message: `Of the projected ${formatINR(r.projectedCorpus)}, ${formatINR(growth)} is growth on ${formatINR(r.totalInvested)} invested.`,
        });
    }
    return out.slice(0, 5);
}
//# sourceMappingURL=copilot.js.map