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
    return [{ tone: "info", icon: "🧺", title: "Pick a mix", message: "Pick a mix on the Portfolio tab to see how this goal grows." }];
  }

  const years = `${inputs.horizonYears} ${inputs.horizonYears === 1 ? "year" : "years"}`;
  if (r.onTrack) {
    out.push({ tone: "positive", icon: "✅", title: "You're on track", message: `You'll reach ${formatINR(r.projectedCorpus)}. That's ${formatINR(r.gap)} more than the ${formatINR(r.requiredCorpus)} you need.` });
    if (r.goalReachedMonth !== null && r.goalReachedMonth < r.months) {
      out.push({ tone: "positive", icon: "⏱️", title: "Ahead of schedule", message: `At this rate you reach the goal in about ${formatYears(r.goalReachedMonth / 12)}.` });
    }
  } else {
    // The title matches the size of the gap: "A little short" for a gap of
    // more than half the goal would mislead.
    const level = gapLevel(r);
    const monthly = neededMonthly(r);
    const extra = Math.max(0, monthly - Math.round(inputs.monthlySip));
    out.push({ tone: level === "far_short" ? "negative" : "warning", icon: level === "far_short" ? "⚠️" : "📉", title: GAP_LABEL[level], message: `You'll reach ${formatINR(r.projectedCorpus)}. That's ${formatINR(Math.abs(r.gap))} short. Add ${formatINR(extra)} a month (${formatINR(monthly)} in total) and you'll make it.` });
  }

  const eq = growthWeight(inputs.allocation);
  if (inputs.horizonYears <= 3 && eq > 0.4) {
    out.push({ tone: "warning", icon: "🎢", title: "Too risky for a goal this close", message: `${formatPct(eq, 0)} of this money is in stocks and you need it in ${years}. One bad year could cut it. Move it to safer funds.` });
  } else if (inputs.horizonYears >= 10 && eq < 0.4) {
    out.push({ tone: "info", icon: "🌱", title: "Room to grow", message: `You have ${years}, and only ${formatPct(eq, 0)} of this money is in stocks. Over that long, stocks tend to grow more.` });
  }

  const top = [...weights].sort((a, b) => b.weight - a.weight)[0];
  if (top && top.weight > 0.7) {
    out.push({ tone: "info", icon: "🧺", title: "Too much in one fund", message: `${formatPct(top.weight, 0)} is in ${FUND_MAP[top.id]?.name ?? "one fund"}. Spreading it across funds lowers the risk.` });
  }

  const total = allocationTotal(inputs.allocation);
  if (Math.abs(total - 100) > 0.5) {
    out.push({ tone: "info", icon: "⚖️", title: `Your mix is ${Math.round(total)}% filled`, message: `We work it out as shares of 100%. Pick a mix to fill it.` });
  }

  // The cost of waiting: same target, same date, one year less of investing.
  if (inputs.horizonYears > 1) {
    const later = neededMonthly({ requiredSip: requiredSip(r.requiredCorpus, inputs.currentSavings, r.blendedReturn, inputs.horizonYears - 1) });
    out.push({ tone: "info", icon: "⏳", title: "The cost of waiting", message: `Wait a year and you'll need ${formatINR(later)} a month instead of ${formatINR(neededMonthly(r))}. Starting now is cheaper.` });
  }

  out.push({ tone: "info", icon: "🔥", title: "Prices go up", message: `${formatINR(inputs.targetToday)} today is about ${formatINR(r.requiredCorpus)} in ${years}, so we plan for ${formatINR(r.requiredCorpus)}.` });

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
