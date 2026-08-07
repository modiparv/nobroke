/**
 * The NoBroke Score: transparent fund scoring from NAV history alone.
 *
 * Four factors, each 0 to 100, each visible to the user:
 *   consistency   share of rolling 12-month windows with a positive return
 *   downside      how deep the worst peak-to-trough fall was (max drawdown)
 *   riskAdjusted  annualised return per unit of annualised volatility
 *   track         how much history exists (5 years = full marks)
 *
 * Weighted sum -> score. No machine learning, no opinion: every number can
 * be recomputed by hand from published NAVs. Expense ratio joins as a fifth
 * factor once TER disclosures are ingested; category-relative percentiles
 * replace absolute thresholds once our own price store holds full histories.
 *
 * Calibration constants are named and grouped so changing the rubric is a
 * diff, not an archaeology dig.
 */

export interface SeriesPoint {
  /** ms epoch */
  t: number;
  nav: number;
}

export interface ScoreComponents {
  consistency: number;
  downside: number;
  riskAdjusted: number;
  track: number;
}

export interface FundScore {
  /** 0..100, one decimal */
  score: number;
  components: ScoreComponents;
  monthsCovered: number;
  grade: "Strong" | "Solid" | "Mixed" | "Weak";
}

const WEIGHTS = { consistency: 0.3, downside: 0.25, riskAdjusted: 0.3, track: 0.15 };
/** Fewer months than this and a score would be noise: return null instead. */
const MIN_MONTHS = 18;
/** Score horizon: five years of month-ends. */
const MAX_MONTHS = 60;
/** Max drawdown mapping: 0% -> 100 points, 40%+ -> 0. */
const DRAWDOWN_FLOOR = 0.4;
/** Return/volatility ratio worth full marks. */
const RATIO_CEILING = 1.5;

/** Last NAV of each calendar month, oldest first. */
export function monthEnds(points: SeriesPoint[]): SeriesPoint[] {
  const byMonth = new Map<number, SeriesPoint>();
  for (const p of points) {
    if (!(p.nav > 0) || !Number.isFinite(p.t)) continue;
    const d = new Date(p.t);
    const key = d.getUTCFullYear() * 12 + d.getUTCMonth();
    const prev = byMonth.get(key);
    if (!prev || p.t > prev.t) byMonth.set(key, p);
  }
  return [...byMonth.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, p]) => p)
    .slice(-(MAX_MONTHS + 1));
}

function clamp(v: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, v));
}

export function scoreFromSeries(points: SeriesPoint[]): FundScore | null {
  const series = monthEnds(points);
  const monthsCovered = series.length - 1;
  if (monthsCovered < MIN_MONTHS) return null;

  const returns: number[] = [];
  for (let i = 1; i < series.length; i++) returns.push(series[i].nav / series[i - 1].nav - 1);

  // Consistency: rolling 12-month windows, stepped monthly.
  let positive = 0;
  let windows = 0;
  for (let start = 0; start + 12 <= series.length - 1; start++) {
    windows++;
    if (series[start + 12].nav / series[start].nav - 1 > 0) positive++;
  }
  const consistency = windows > 0 ? clamp((positive / windows) * 100) : 0;

  // Downside: max drawdown on the month-end series.
  let peak = series[0].nav;
  let maxDrawdown = 0;
  for (const p of series) {
    if (p.nav > peak) peak = p.nav;
    maxDrawdown = Math.max(maxDrawdown, 1 - p.nav / peak);
  }
  const downside = clamp(100 * (1 - maxDrawdown / DRAWDOWN_FLOOR));

  // Risk-adjusted: annualised return over annualised monthly volatility.
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length;
  const annVol = Math.sqrt(variance) * Math.sqrt(12);
  const annReturn = Math.pow(series[series.length - 1].nav / series[0].nav, 12 / monthsCovered) - 1;
  const ratio = annVol < 1e-9 ? (annReturn > 0 ? RATIO_CEILING : 0) : annReturn / annVol;
  const riskAdjusted = clamp((ratio / RATIO_CEILING) * 100);

  const track = clamp((monthsCovered / MAX_MONTHS) * 100);

  const score =
    Math.round(
      (consistency * WEIGHTS.consistency +
        downside * WEIGHTS.downside +
        riskAdjusted * WEIGHTS.riskAdjusted +
        track * WEIGHTS.track) *
        10,
    ) / 10;

  const grade = score >= 75 ? "Strong" : score >= 55 ? "Solid" : score >= 40 ? "Mixed" : "Weak";

  return {
    score,
    components: {
      consistency: Math.round(consistency),
      downside: Math.round(downside),
      riskAdjusted: Math.round(riskAdjusted),
      track: Math.round(track),
    },
    monthsCovered,
    grade,
  };
}
