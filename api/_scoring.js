/**
 * Deployment mirror of src/lib/scoring.ts (types stripped, nothing else).
 * The canonical, tested implementation lives there; change behaviour there
 * first and mirror it here. Underscore file: not routed.
 */

const WEIGHTS = { consistency: 0.3, downside: 0.25, riskAdjusted: 0.3, track: 0.15 };
const MIN_MONTHS = 18;
const MAX_MONTHS = 60;
const DRAWDOWN_FLOOR = 0.4;
const RATIO_CEILING = 1.5;

export function monthEnds(points) {
  const byMonth = new Map();
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

function clamp(v, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, v));
}

export function scoreFromSeries(points) {
  const series = monthEnds(points);
  const monthsCovered = series.length - 1;
  if (monthsCovered < MIN_MONTHS) return null;

  const returns = [];
  for (let i = 1; i < series.length; i++) returns.push(series[i].nav / series[i - 1].nav - 1);

  let positive = 0;
  let windows = 0;
  for (let start = 0; start + 12 <= series.length - 1; start++) {
    windows++;
    if (series[start + 12].nav / series[start].nav - 1 > 0) positive++;
  }
  const consistency = windows > 0 ? clamp((positive / windows) * 100) : 0;

  let peak = series[0].nav;
  let maxDrawdown = 0;
  for (const p of series) {
    if (p.nav > peak) peak = p.nav;
    maxDrawdown = Math.max(maxDrawdown, 1 - p.nav / peak);
  }
  const downside = clamp(100 * (1 - maxDrawdown / DRAWDOWN_FLOOR));

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
