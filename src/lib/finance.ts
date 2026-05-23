import type { Allocation, PlanInputs, PlanResult, ProjectionPoint } from "../types.js";
import { ASSET_MAP, EQUITY_IDS } from "./assets.js";

export function allocationTotal(alloc: Allocation): number {
  return Object.values(alloc).reduce((s, v) => s + (v > 0 ? v : 0), 0);
}

/** Returns weights summing to 1 (dropping non-positive entries). */
export function normalizedWeights(alloc: Allocation): Array<{ id: string; weight: number }> {
  const entries = Object.entries(alloc).filter(([, v]) => v > 0);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  if (total <= 0) return [];
  return entries.map(([id, v]) => ({ id, weight: v / total }));
}

export function blendedReturn(alloc: Allocation): number {
  return normalizedWeights(alloc).reduce(
    (s, { id, weight }) => s + weight * (ASSET_MAP[id]?.expectedReturn ?? 0),
    0,
  );
}

/** Simplified blended volatility (weighted average; ignores cross-correlation). */
export function blendedVolatility(alloc: Allocation): number {
  return normalizedWeights(alloc).reduce(
    (s, { id, weight }) => s + weight * (ASSET_MAP[id]?.volatility ?? 0),
    0,
  );
}

export function equityWeight(alloc: Allocation): number {
  return normalizedWeights(alloc)
    .filter((x) => EQUITY_IDS.includes(x.id))
    .reduce((s, x) => s + x.weight, 0);
}

/**
 * Month-by-month corpus path. Contributions are start-of-month (annuity due):
 * each month we add the SIP, then grow by one monthly period.
 */
export function projectionSeries(inputs: PlanInputs, annualReturn: number): ProjectionPoint[] {
  const months = Math.max(1, Math.round(inputs.horizonYears * 12));
  const rm = annualReturn / 12;
  const series: ProjectionPoint[] = [{ month: 0, year: 0, invested: inputs.currentSavings, value: inputs.currentSavings }];
  let value = inputs.currentSavings;
  for (let m = 1; m <= months; m++) {
    value = (value + inputs.monthlySip) * (1 + rm);
    series.push({ month: m, year: m / 12, invested: inputs.currentSavings + inputs.monthlySip * m, value });
  }
  return series;
}

/** Future cost of a goal that costs `targetToday` now, at the given inflation. */
export function requiredCorpus(targetToday: number, inflation: number, horizonYears: number): number {
  return targetToday * Math.pow(1 + inflation, horizonYears);
}

/** Monthly SIP (annuity due) needed to reach `target` given a lump sum already invested. */
export function requiredSip(target: number, currentSavings: number, annualReturn: number, horizonYears: number): number {
  const months = Math.max(1, Math.round(horizonYears * 12));
  const rm = annualReturn / 12;
  const fvLump = currentSavings * Math.pow(1 + rm, months);
  const remaining = target - fvLump;
  if (remaining <= 0) return 0;
  if (rm === 0) return remaining / months;
  const factor = ((Math.pow(1 + rm, months) - 1) / rm) * (1 + rm);
  return remaining / factor;
}

export interface CashFlow {
  amount: number;
  date: Date;
}

const MS_PER_YEAR = 365 * 24 * 3600 * 1000;

function xnpv(rate: number, flows: CashFlow[]): number {
  const t0 = flows[0].date.getTime();
  return flows.reduce((s, f) => s + f.amount / Math.pow(1 + rate, (f.date.getTime() - t0) / MS_PER_YEAR), 0);
}

/** Money-weighted annualized return (XIRR) via bisection with a Newton fallback. */
export function xirr(flows: CashFlow[]): number {
  if (flows.length < 2) return 0;
  if (!flows.some((f) => f.amount > 0) || !flows.some((f) => f.amount < 0)) return 0;

  let lo = -0.9999;
  let hi = 10;
  let flo = xnpv(lo, flows);
  const fhi = xnpv(hi, flows);

  if (flo * fhi > 0) {
    // No sign change in the bracket — fall back to Newton's method.
    let rate = 0.1;
    for (let i = 0; i < 100; i++) {
      const f = xnpv(rate, flows);
      const d = (xnpv(rate + 1e-6, flows) - f) / 1e-6;
      if (Math.abs(d) < 1e-12) break;
      const next = rate - f / d;
      if (!isFinite(next)) break;
      if (Math.abs(next - rate) < 1e-8) return next;
      rate = Math.max(-0.9999, next);
    }
    return rate;
  }

  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fmid = xnpv(mid, flows);
    if (Math.abs(fmid) < 1e-6) return mid;
    if (flo * fmid < 0) hi = mid;
    else {
      lo = mid;
      flo = fmid;
    }
  }
  return (lo + hi) / 2;
}

/** Cashflows matching the annuity-due projection: SIP at t=0..months-1, corpus inflow at t=months. */
export function buildCashFlows(inputs: PlanInputs, projectedCorpus: number): CashFlow[] {
  const months = Math.max(1, Math.round(inputs.horizonYears * 12));
  const start = new Date(2025, 0, 1);
  const flows: CashFlow[] = [{ amount: -(inputs.currentSavings + inputs.monthlySip), date: new Date(start) }];
  for (let m = 1; m < months; m++) {
    const d = new Date(start);
    d.setMonth(d.getMonth() + m);
    flows.push({ amount: -inputs.monthlySip, date: d });
  }
  const end = new Date(start);
  end.setMonth(end.getMonth() + months);
  flows.push({ amount: projectedCorpus, date: end });
  return flows;
}

export function computePlan(inputs: PlanInputs): PlanResult {
  const annualReturn = blendedReturn(inputs.allocation);
  const series = projectionSeries(inputs, annualReturn);
  const months = Math.max(1, Math.round(inputs.horizonYears * 12));
  const projectedCorpus = series[series.length - 1].value;
  const totalInvested = inputs.currentSavings + inputs.monthlySip * months;
  const reqCorpus = requiredCorpus(inputs.targetToday, inputs.inflation, inputs.horizonYears);
  const gap = projectedCorpus - reqCorpus;
  const irr = xirr(buildCashFlows(inputs, projectedCorpus));

  let goalReachedMonth: number | null = null;
  for (const p of series) {
    if (p.value >= reqCorpus) {
      goalReachedMonth = p.month;
      break;
    }
  }

  return {
    blendedReturn: annualReturn,
    blendedVolatility: blendedVolatility(inputs.allocation),
    xirr: irr,
    projectedCorpus,
    requiredCorpus: reqCorpus,
    totalInvested,
    gap,
    onTrack: gap >= 0,
    requiredSip: requiredSip(reqCorpus, inputs.currentSavings, annualReturn, inputs.horizonYears),
    series,
    months,
    realProjectedCorpus: projectedCorpus / Math.pow(1 + inputs.inflation, inputs.horizonYears),
    goalReachedMonth,
  };
}
