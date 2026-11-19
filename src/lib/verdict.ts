import type { PlanResult } from "./types";
import { inr } from "./glue.ts";

/**
 * The sentence under a goal's verdict, built from the plan's own numbers.
 * Kept apart from the screen so the wording can be tested.
 */

/** A goal the split funds to the rupee overshoots by ₹1 of rounding. That is
    not "₹1 more than you need", so a surplus under 1% of the goal counts as none. */
const fundedToTheRupee = (r: Pick<PlanResult, "requiredCorpus" | "gap">) => r.gap >= 0 && r.gap < r.requiredCorpus * 0.01;

/** The amount a goal is shown to reach, wherever it sits beside what the goal
    needs: the row, the detail line and the chart's key all give this figure,
    so "₹21,200 by 2027" is never followed by "will reach ₹21,201". */
export function reachFigure(r: Pick<PlanResult, "projectedCorpus" | "requiredCorpus" | "gap">): number {
  return fundedToTheRupee(r) ? r.requiredCorpus : r.projectedCorpus;
}

/** On track. */
export function onTrackMessage(r: Pick<PlanResult, "projectedCorpus" | "requiredCorpus" | "gap">): string {
  if (r.gap < r.requiredCorpus * 0.01) return `You'll reach the ${inr(r.requiredCorpus)} you need.`;
  return `You'll reach ${inr(r.projectedCorpus)}. That's ${inr(r.gap)} more than the ${inr(r.requiredCorpus)} you need.`;
}

/** Short. The total is only added when the goal already gets some money:
    "₹3,020 more a month (₹3,020 in total)" says one thing twice. */
export function shortMessage(r: Pick<PlanResult, "projectedCorpus" | "gap">, monthlyNow: number, monthlyNeeded: number): string {
  const extra = Math.max(0, monthlyNeeded - Math.round(monthlyNow));
  const total = extra === monthlyNeeded ? "" : ` (${inr(monthlyNeeded)} in total)`;
  return `You'll reach ${inr(r.projectedCorpus)}. That's ${inr(Math.abs(r.gap))} short. ${inr(extra)} more a month${total} would close the gap.`;
}
