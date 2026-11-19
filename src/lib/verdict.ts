import type { PlanResult } from "./types";
import { inr } from "./glue.ts";

/**
 * The sentence under a goal's verdict, built from the plan's own numbers.
 * Kept apart from the screen so the wording can be tested.
 */

/** On track. A goal the split funds to the rupee overshoots by ₹1 of
    rounding; that is not "₹1 more than you need", so a surplus under 1% of
    the goal is left out. */
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
