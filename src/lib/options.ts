import { computePlan } from "./finance.ts";
import type { PlanInputs, PlanResult } from "./types";

/**
 * The honest moves for a goal that is short at today's pace, each a real
 * number from the same engine as the brief: the monthly that gets there by
 * the date, the year today's pace does get there, and the target in today's
 * money that today's pace reaches by the date. Any of the three closes the
 * gap; which one is the person's call.
 */
export interface GoalOptions {
  /** The monthly amount that reaches the target by the date. */
  monthly: number;
  /** Years from now at which today's pace is on track, or null if not within reach. */
  year: number | null;
  /** The target in today's money that today's pace reaches by the date. */
  target: number;
}

const MAX_HORIZON_YEARS = 40;

/** The first horizon beyond the goal's own at which today's pace is on
    track (the need keeps growing with inflation, so this is a real check,
    not a division). Null when nothing is being put in, or when forty years
    would not do it. */
export function reachableHorizon(inputs: PlanInputs, maxYears = MAX_HORIZON_YEARS): number | null {
  if (inputs.monthlySip <= 0 && inputs.currentSavings <= 0) return null;
  for (let years = inputs.horizonYears + 1; years <= maxYears; years++) {
    if (computePlan({ ...inputs, horizonYears: years }).onTrack) return years;
  }
  return null;
}

/** Round a target down to a clean step for its size. */
export function cleanTarget(value: number): number {
  const step = value >= 1_000_000 ? 50_000 : value >= 100_000 ? 10_000 : value >= 10_000 ? 1_000 : 500;
  return Math.max(0, Math.floor(value / step) * step);
}

export function goalOptions(inputs: PlanInputs, r: PlanResult): GoalOptions {
  return {
    monthly: Math.ceil(r.requiredSip),
    year: r.onTrack ? null : reachableHorizon(inputs),
    target: cleanTarget(r.realProjectedCorpus),
  };
}
