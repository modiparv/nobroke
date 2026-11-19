import type { PlanResult } from "./types";
import { inr } from "./glue.ts";

/**
 * The sentence under a goal's verdict, built from the plan's own numbers.
 * Kept apart from the screen so the wording can be tested.
 */

type Reach = Pick<PlanResult, "projectedCorpus" | "requiredCorpus" | "gap" | "months" | "blendedReturn">;

/** A goal the split funds to the rupee still overshoots a little: its monthly
    amount and its saved money are each rounded up to a whole rupee. The most
    that can add by the goal's date is what one rupee a month and one rupee
    saved grow to. A surplus under that is rounding, not "more than you need".
    A surplus above it is real, however small a part of the goal it is. */
function roundingRoom(r: Pick<PlanResult, "months" | "blendedReturn">): number {
  const rm = r.blendedReturn / 12;
  const grown = Math.pow(1 + rm, r.months);
  return (rm === 0 ? r.months : ((grown - 1) / rm) * (1 + rm)) + grown;
}
const fundedToTheRupee = (r: Pick<PlanResult, "gap" | "months" | "blendedReturn">) => r.gap >= 0 && r.gap < roundingRoom(r);

/** The amount a goal is shown to reach, wherever it sits beside what the goal
    needs: the row, the detail line and the chart's key all give this figure,
    so "₹21,200 by 2027" is never followed by "will reach ₹21,201". */
export function reachFigure(r: Reach): number {
  return fundedToTheRupee(r) ? r.requiredCorpus : r.projectedCorpus;
}

/** On track. */
export function onTrackMessage(r: Reach): string {
  if (fundedToTheRupee(r) || r.gap < r.requiredCorpus * 0.01) return `You'll reach the ${inr(r.requiredCorpus)} you need.`;
  return `You'll reach ${inr(r.projectedCorpus)}. That's ${inr(r.gap)} more than the ${inr(r.requiredCorpus)} you need.`;
}

/** Short. The total is only added when the goal already gets some money:
    "₹3,020 more a month (₹3,020 in total)" says one thing twice. */
export function shortMessage(r: Pick<PlanResult, "projectedCorpus" | "gap">, monthlyNow: number, monthlyNeeded: number): string {
  const extra = Math.max(0, monthlyNeeded - Math.round(monthlyNow));
  const total = extra === monthlyNeeded ? "" : ` (${inr(monthlyNeeded)} in total)`;
  return `You'll reach ${inr(r.projectedCorpus)}. That's ${inr(Math.abs(r.gap))} short. ${inr(extra)} more a month${total} would close the gap.`;
}
