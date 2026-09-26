import { requiredCorpus, requiredSip } from "./finance.ts";
import type { PlanGoal } from "./types";

/**
 * How money is shared between goals, from what each still needs.
 *
 * Saved money goes to the nearest goals first, and only up to what covers
 * each of them by its date. The monthly pool is then shared by the need
 * that remains once each goal's saved money is counted: a goal that
 * savings already cover takes nothing a month, and the money it would have
 * taken flows to the next goal. Before this, a covered goal kept drawing
 * its full monthly share and the goal behind it starved.
 */

/** Goals in priority order: the given order, then any goal it does not name. */
function ordered(goals: PlanGoal[], order: string[]): PlanGoal[] {
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

/** The saved money that fully covers a goal by its date, growing at the
    portfolio's pace with the same monthly compounding the projection uses;
    rounded up to the rupee so "covered" survives floating-point arithmetic. */
export function coveringCapital(goal: Pick<PlanGoal, "targetToday" | "horizonYears">, inflation: number, annualReturn: number): number {
  const months = Math.max(1, Math.round(goal.horizonYears * 12));
  const need = requiredCorpus(goal.targetToday, inflation, goal.horizonYears);
  return Math.ceil(need / Math.pow(1 + annualReturn / 12, months));
}

/** Saved money by goal: nearest first, each up to what covers it. Money left
    after every goal is covered is spread in proportion to their size, so it
    is never hidden. */
export function splitCapital(goals: PlanGoal[], order: string[], capital: number, inflation: number, annualReturn: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const g of goals) out[g.id] = 0;
  if (goals.length === 0 || capital <= 0) return out;
  const cover = new Map(goals.map((g) => [g.id, coveringCapital(g, inflation, annualReturn)]));
  let remaining = capital;
  for (const g of ordered(goals, order)) {
    const take = Math.min(remaining, cover.get(g.id) ?? 0);
    out[g.id] = take;
    remaining -= take;
    if (remaining <= 0) break;
  }
  if (remaining > 0) {
    const total = goals.reduce((s, g) => s + (cover.get(g.id) ?? 0), 0);
    for (const g of goals) out[g.id] += total > 0 ? (remaining * (cover.get(g.id) ?? 0)) / total : remaining / goals.length;
  }
  return out;
}

/** The monthly pool as percents by goal, from each goal's need net of the
    saved money it holds (whole rupees, rounded up, so a goal given its need
    is on track and not a hair short). Nearest goals are filled first; when
    the pool covers every need, it is shared in proportion to need. */
export function splitMonthly(
  goals: PlanGoal[],
  order: string[],
  monthlySip: number,
  capitalByGoal: Record<string, number>,
  inflation: number,
  annualReturn: number,
): Record<string, number> {
  const shares: Record<string, number> = {};
  if (goals.length === 0) return shares;
  const need: Record<string, number> = {};
  let totalNeed = 0;
  for (const g of goals) {
    const corpus = requiredCorpus(g.targetToday, inflation, g.horizonYears);
    need[g.id] = Math.ceil(requiredSip(corpus, capitalByGoal[g.id] ?? 0, annualReturn, g.horizonYears));
    totalNeed += need[g.id];
  }
  if (totalNeed <= 0) {
    for (const g of goals) shares[g.id] = 100 / goals.length;
    return shares;
  }
  if (monthlySip <= 0 || monthlySip >= totalNeed) {
    for (const g of goals) shares[g.id] = (need[g.id] / totalNeed) * 100;
    return shares;
  }
  let remaining = monthlySip;
  for (const g of ordered(goals, order)) {
    const give = Math.max(0, Math.min(need[g.id], remaining));
    shares[g.id] = (give / monthlySip) * 100;
    remaining -= give;
  }
  return shares;
}
