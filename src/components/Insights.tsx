import type { Insight, PlanInputs, PlanResult } from "../lib/types";
import { allocationTotal, growthWeight, normalizedWeights, requiredSip } from "../lib/finance";
import { FUND_MAP } from "../lib/funds";
import { formatINR, formatPct, formatYears } from "../lib/format";
import { GAP_LABEL, gapLevel } from "../lib/gap";
import { neededMonthly } from "../lib/options";

function generate(inputs: PlanInputs, r: PlanResult): Insight[] {
  const out: Insight[] = [];
  const weights = normalizedWeights(inputs.allocation);
  if (weights.length === 0) {
    return [{ tone: "info", icon: "🧺", title: "Pick a portfolio", message: "Pick a portfolio in the Portfolio tab to see your plan come alive." }];
  }

  if (r.onTrack) {
    out.push({ tone: "positive", icon: "✅", title: "You're on track", message: `Projected ${formatINR(r.projectedCorpus)} clears your ${formatINR(r.requiredCorpus)} goal, with a ${formatINR(r.gap)} cushion to spare.` });
    if (r.goalReachedMonth !== null && r.goalReachedMonth < r.months) {
      out.push({ tone: "positive", icon: "⏱️", title: "Ahead of schedule", message: `At this pace you cross the goal in ~${formatYears(r.goalReachedMonth / 12)}.` });
    }
  } else {
    // The title matches the size of the gap: "A little short" for a gap of
    // more than half the goal would mislead.
    const level = gapLevel(r);
    const monthly = neededMonthly(r);
    const extra = Math.max(0, monthly - Math.round(inputs.monthlySip));
    out.push({ tone: level === "far_short" ? "negative" : "warning", icon: level === "far_short" ? "🚨" : "📉", title: GAP_LABEL[level], message: `At today's pace you reach ${formatINR(r.projectedCorpus)}, about ${formatINR(Math.abs(r.gap))} under. Raising your monthly investing to ${formatINR(monthly)}/mo (+${formatINR(extra)}) closes the gap.` });
  }

  const eq = growthWeight(inputs.allocation);
  if (inputs.horizonYears <= 3 && eq > 0.4) {
    out.push({ tone: "warning", icon: "🎢", title: "A bit bold for a near goal", message: `${formatPct(eq, 0)} in stocks with only ${formatYears(inputs.horizonYears)} left can swing a lot. Lean toward bonds (calmer) for this one.` });
  } else if (inputs.horizonYears >= 10 && eq < 0.4) {
    out.push({ tone: "info", icon: "🌱", title: "Room to grow", message: `With ${formatYears(inputs.horizonYears)} on your side, ${formatPct(eq, 0)} in stocks is cautious. More stocks tend to grow faster over long periods.` });
  }

  const top = [...weights].sort((a, b) => b.weight - a.weight)[0];
  if (top && top.weight > 0.7) {
    out.push({ tone: "info", icon: "🧺", title: "Concentrated bet", message: `${formatPct(top.weight, 0)} sits in ${FUND_MAP[top.id]?.name ?? "one fund"}. Spreading out smooths the ride.` });
  }

  const total = allocationTotal(inputs.allocation);
  if (Math.abs(total - 100) > 0.5) {
    out.push({ tone: "info", icon: "⚖️", title: `Your portfolio is ${Math.round(total)}% filled`, message: `We work it out as shares of 100%. A ready-made portfolio fills it cleanly.` });
  }

  // The cost of waiting: same target, same date, one year less of investing.
  if (inputs.horizonYears > 1) {
    const later = neededMonthly({ requiredSip: requiredSip(r.requiredCorpus, inputs.currentSavings, r.blendedReturn, inputs.horizonYears - 1) });
    out.push({ tone: "info", icon: "⏳", title: "The cost of waiting", message: `Start a year later and the monthly needed rises to ${formatINR(later)}, from ${formatINR(neededMonthly(r))} now. Time is doing part of the work.` });
  }

  out.push({ tone: "info", icon: "🔥", title: "Prices rise over time", message: `Your ${formatINR(inputs.targetToday)} goal will cost about ${formatINR(r.requiredCorpus)} in ${formatYears(inputs.horizonYears)}, so we plan for the future price, not today's.` });

  return out.slice(0, 4);
}

const BORDER: Record<string, string> = {
  positive: "rgb(var(--pos))",
  warning: "rgb(var(--cau))",
  negative: "rgb(var(--neg))",
  info: "rgb(var(--line))",
};

/** Folded, the verdict and any warning show; the rest waits behind "more". */
export default function Insights({ r, inputs, expanded = true }: { r: PlanResult; inputs: PlanInputs; expanded?: boolean }) {
  const all = generate(inputs, r);
  const list = expanded ? all : all.filter((ins, i) => i === 0 || ins.tone === "warning" || ins.tone === "negative");
  return (
    <div className="flex flex-col gap-2.5">
      {list.map((ins, i) => (
        <div key={i} className="flex gap-3 rounded-xl border border-line bg-surface-2 p-3" style={{ borderLeft: `4px solid ${BORDER[ins.tone]}` }}>
          <span className="text-lg leading-tight">{ins.icon}</span>
          <div>
            <div className="text-support font-medium">{ins.title}</div>
            <div className="text-xs text-muted">{ins.message}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
