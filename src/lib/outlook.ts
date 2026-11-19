import type { Allocation, PlanGoal } from "./types";
import { blendedReturn, computePlan } from "./finance.ts";
import { gapLevel, type GapLevel } from "./gap.ts";
import { splitCapital, splitMonthly } from "./split.ts";

/**
 * What every goal looks like under a plan that may differ from the saved
 * one: more a month, more in the bank, a different mix. The sheets show it
 * live before anything is saved, so a change is never a leap of faith. The
 * arithmetic is exactly the plan's own (lib/split for who gets what,
 * computePlan for where it lands), so the preview and the plan after
 * saving always agree.
 */

export interface PlanShape {
  goals: PlanGoal[];
  /** Goal ids in priority order. Goals it does not name come after, in
      declaration order. */
  goalOrder: string[];
  /** Percent shares by goal when the person pinned the split by hand (or
      when the split should be kept as it is). Null lets the split follow
      what each goal still needs, as the plan does by default. */
  goalShares: Record<string, number> | null;
  monthlySip: number;
  /** Cash plus every investment held today. */
  capital: number;
  inflation: number;
  allocation: Allocation;
}

export interface GoalOutlook {
  id: string;
  name: string;
  level: GapLevel;
  /** Years from now to the goal's date. */
  horizonYears: number;
  /** What the goal reaches by its date, and how far that is from the need. */
  projected: number;
  need: number;
  gap: number;
  /** Months from now at which the goal is reached, when it is on track and
      reached before its date. Null otherwise. */
  reachedMonth: number | null;
  /** The monthly amount flowing to this goal under this shape. */
  monthly: number;
}

/** Goals in priority order: the given order, then any goal it does not name. */
export function inPriority(goals: PlanGoal[], order: string[]): PlanGoal[] {
  const byId = new Map(goals.map((g) => [g.id, g]));
  const seen = new Set<string>();
  const out: PlanGoal[] = [];
  for (const id of order) {
    const g = byId.get(id);
    if (g && !seen.has(id)) {
      out.push(g);
      seen.add(id);
    }
  }
  for (const g of goals) if (!seen.has(g.id)) out.push(g);
  return out;
}

export function outlook(p: PlanShape): GoalOutlook[] {
  const ret = blendedReturn(p.allocation);
  const capital = splitCapital(p.goals, p.goalOrder, p.capital, p.inflation, ret);
  const shares = p.goalShares ?? splitMonthly(p.goals, p.goalOrder, p.monthlySip, capital, p.inflation, ret);
  const n = p.goals.length;
  return inPriority(p.goals, p.goalOrder).map((g) => {
    const pct = shares[g.id];
    const share = pct == null ? (n ? 1 / n : 1) : pct / 100;
    const monthly = p.monthlySip * share;
    const r = computePlan({
      targetToday: g.targetToday,
      horizonYears: g.horizonYears,
      currentSavings: capital[g.id] ?? 0,
      monthlySip: monthly,
      inflation: p.inflation,
      allocation: p.allocation,
    });
    const early = r.onTrack && r.goalReachedMonth !== null && r.goalReachedMonth < r.months;
    return {
      id: g.id,
      name: g.name,
      level: gapLevel(r),
      horizonYears: g.horizonYears,
      projected: r.projectedCorpus,
      need: r.requiredCorpus,
      gap: r.gap,
      reachedMonth: early ? r.goalReachedMonth : null,
      monthly,
    };
  });
}

export function onTrackCount(items: GoalOutlook[]): number {
  return items.filter((i) => i.level === "on_track").length;
}

/**
 * The monthly amount at which the named goal reads on track, for the
 * "Put in more" sheet. The sheet shares money out again as the amount
 * changes, so nearer goals take their part first and a figure worked out
 * for this goal alone can leave it short. This starts at that figure and
 * steps up until the outlook itself says on track. If no amount within the
 * limit does it, the starting figure stands and the sheet shows the result.
 */
export function monthlyToPutOnTrack(shape: PlanShape, goalId: string, start: number, step = 500, max = 1_000_000): number {
  const from = Math.max(0, Math.round(start));
  const onTrackAt = (monthly: number) => outlook({ ...shape, monthlySip: monthly }).find((i) => i.id === goalId)?.level === "on_track";
  if (from > max || onTrackAt(from)) return from;
  // More a month never takes money from a goal, so the first amount that works can be found by halving.
  let hi = Math.floor((max - from) / step);
  if (hi < 1 || !onTrackAt(from + hi * step)) return from;
  let lo = 0;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (onTrackAt(from + mid * step)) hi = mid;
    else lo = mid;
  }
  return from + hi * step;
}
