import { computePlan } from "./finance.ts";
import type { GapLevel } from "./gap.ts";
import type { PlanInputs, PlanResult } from "./types";

/** One line of context under the moves for an education goal that is far
    short: a loan or a scholarship is a real part of how such goals get
    funded. General information, never a product. */
const EDUCATION_NOTE = "An education loan or scholarship can cover part of this.";
export function educationNote(goalId: string, level: GapLevel): string | null {
  return (goalId === "child" || goalId === "college") && level === "far_short" ? EDUCATION_NOTE : null;
}

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

/** A date move further out than this is not a move, it is a different goal:
    a laptop in 2036 is not the laptop you wanted in 2027. */
export const MAX_DATE_MOVE_YEARS = 5;

export interface GoalOptionRules {
  /** The goal's date is set by life (a child's college year, a wedding), so
      the plan never offers to move it. */
  dateFixed?: boolean;
}

/** The first horizon beyond the goal's own at which today's pace is on
    track (the need keeps growing with inflation, so this is a real check,
    not a division). Null when nothing is being put in, or when maxYears
    would not do it. */
export function reachableHorizon(inputs: PlanInputs, maxYears = MAX_HORIZON_YEARS): number | null {
  if (inputs.monthlySip <= 0 && inputs.currentSavings <= 0) return null;
  for (let years = inputs.horizonYears + 1; years <= maxYears; years++) {
    if (computePlan({ ...inputs, horizonYears: years }).onTrack) return years;
  }
  return null;
}

/** The monthly amount that gets a goal there, rounded up to the rupee: the
    one number every surface shows, so the goal card and the reason card
    never disagree by a rupee. */
export function neededMonthly(r: Pick<PlanResult, "requiredSip">): number {
  return Math.ceil(r.requiredSip);
}

/** Round a target down to a clean step for its size. */
export function cleanTarget(value: number): number {
  const step = value >= 1_000_000 ? 50_000 : value >= 100_000 ? 10_000 : value >= 10_000 ? 1_000 : 500;
  return Math.max(0, Math.floor(value / step) * step);
}

export function goalOptions(inputs: PlanInputs, r: PlanResult, rules: GoalOptionRules = {}): GoalOptions {
  const canMove = !r.onTrack && !rules.dateFixed;
  return {
    monthly: neededMonthly(r),
    year: canMove ? reachableHorizon(inputs, inputs.horizonYears + MAX_DATE_MOVE_YEARS) : null,
    target: cleanTarget(r.realProjectedCorpus),
  };
}
