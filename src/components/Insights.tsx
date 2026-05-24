import type { Insight, PlanInputs, PlanResult } from "../lib/types";
import { allocationTotal, growthWeight, normalizedWeights } from "../lib/finance";
import { FUND_MAP } from "../lib/funds";
import { formatINR, formatPct, formatYears } from "../lib/format";

function generate(inputs: PlanInputs, r: PlanResult): Insight[] {
  const out: Insight[] = [];
  const weights = normalizedWeights(inputs.allocation);
  if (weights.length === 0) {
    return [{ tone: "info", icon: "🧺", title: "Fill your basket", message: "Drag a fund into your basket to see projections come alive." }];
  }

  if (r.onTrack) {
    out.push({ tone: "positive", icon: "✅", title: "You're on track", message: `Projected ${formatINR(r.projectedCorpus)} clears your ${formatINR(r.requiredCorpus)} target — a ${formatINR(r.gap)} cushion.` });
    if (r.goalReachedMonth !== null && r.goalReachedMonth < r.months) {
      out.push({ tone: "positive", icon: "⏱️", title: "Ahead of schedule", message: `At this pace you cross the goal in ~${formatYears(r.goalReachedMonth / 12)}.` });
    }
  } else {
    const extra = Math.max(0, r.requiredSip - inputs.monthlySip);
    out.push({ tone: "warning", icon: "📉", title: "Shortfall ahead", message: `Projected ${formatINR(r.projectedCorpus)} is ${formatINR(Math.abs(r.gap))} short. Step your SIP up to ${formatINR(r.requiredSip)}/mo (+${formatINR(extra)}).` });
  }

  const eq = growthWeight(inputs.allocation);
  if (inputs.horizonYears <= 3 && eq > 0.4) {
    out.push({ tone: "warning", icon: "🎢", title: "Bold for a short goal", message: `${formatPct(eq, 0)} in equity with only ${formatYears(inputs.horizonYears)} left is risky. Lean toward debt.` });
  } else if (inputs.horizonYears >= 10 && eq < 0.4) {
    out.push({ tone: "info", icon: "🌱", title: "Room to grow", message: `With ${formatYears(inputs.horizonYears)} on your side, ${formatPct(eq, 0)} in equity is cautious — more equity compounds faster long-term.` });
  }

  const top = [...weights].sort((a, b) => b.weight - a.weight)[0];
  if (top && top.weight > 0.7) {
    out.push({ tone: "info", icon: "🧺", title: "Concentrated bet", message: `${formatPct(top.weight, 0)} sits in ${FUND_MAP[top.id]?.name ?? "one fund"}. Spreading out smooths the ride.` });
  }

  const total = allocationTotal(inputs.allocation);
  if (Math.abs(total - 100) > 0.5) {
    out.push({ tone: "info", icon: "⚖️", title: `Basket is ${Math.round(total)}% full`, message: `Projections normalize your mix. A preset fills it cleanly to 100%.` });
  }

  out.push({ tone: "info", icon: "🔥", title: "Inflation does the math", message: `Your ${formatINR(inputs.targetToday)} goal will cost ${formatINR(r.requiredCorpus)} in ${formatYears(inputs.horizonYears)}. We plan for the future price.` });

  return out.slice(0, 4);
}

const BORDER: Record<string, string> = { positive: "#6B5300", warning: "#B45309", info: "#E0CFA0" };

export default function Insights({ r, inputs }: { r: PlanResult; inputs: PlanInputs }) {
  const list = generate(inputs, r);
  return (
    <div className="flex flex-col gap-2.5">
      {list.map((ins, i) => (
        <div key={i} className="flex gap-3 rounded-xl border border-line bg-paper p-3" style={{ borderLeft: `4px solid ${BORDER[ins.tone]}` }}>
          <span className="text-lg leading-tight">{ins.icon}</span>
          <div>
            <div className="text-[13px] font-medium">{ins.title}</div>
            <div className="text-xs text-muted">{ins.message}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
