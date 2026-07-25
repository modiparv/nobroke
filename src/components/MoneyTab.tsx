import { blendedReturn, projectionSeries } from "../lib/finance";
import { formatINR } from "../lib/format";
import { actions, holdingsTotal, totalCapital, useStore } from "../store";
import { card, sectionLabel } from "../ui";
import Aggregation from "./Aggregation";
import Holdings from "./Holdings";
import MoneyInput from "./MoneyInput";

/**
 * Money: the wealth management tab.
 *
 * Tracks what you have (net worth + breakdown by category, from real data) and
 * where it goes at the current pace (a projection line from the real engine).
 * The app stores no historical snapshots yet, so the chart is a forward path,
 * labelled as such, never an invented history. Deeper wealth tools (tax, x-ray,
 * costs, hygiene) are listed as rows and land with the wealth engine phases.
 */

const YEARS_AHEAD = 10;

function WealthPath({ series }: { series: Array<{ month: number; value: number }> }) {
  const W = 560;
  const H = 130;
  const P = 8;
  if (series.length < 2) return null;
  const maxY = Math.max(...series.map((p) => p.value), 1);
  const minY = Math.min(...series.map((p) => p.value), 0);
  const x = (i: number) => P + (i / (series.length - 1)) * (W - 2 * P);
  const y = (v: number) => H - P - ((v - minY) / (maxY - minY || 1)) * (H - 2 * P);
  const d = series.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const last = series[series.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full" role="img" aria-label="Projected wealth over the next ten years">
      <path d={`${d} L${x(series.length - 1)},${H - P} L${x(0)},${H - P} Z`} fill="rgb(var(--text))" opacity="0.05" />
      <path d={d} fill="none" stroke="rgb(var(--text))" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(0)} cy={y(series[0].value)} r="3" fill="rgb(var(--text))" />
      <circle cx={x(series.length - 1)} cy={y(last.value)} r="4" fill="rgb(var(--text))" />
    </svg>
  );
}

const TOOLS = ["Tax centre", "Portfolio x-ray", "Cost check", "Nominee audit", "Action inbox"];

export default function MoneyTab() {
  const s = useStore();
  const invested = holdingsTotal(s);
  const total = totalCapital(s);

  const series = projectionSeries(
    {
      targetToday: 0,
      horizonYears: YEARS_AHEAD,
      currentSavings: total,
      monthlySip: s.monthlySip,
      inflation: s.inflation,
      allocation: s.portfolio,
    },
    blendedReturn(s.portfolio),
  );
  const projected = series[series.length - 1]?.value ?? total;

  // Breakdown by category, from real data only: cash plus each holding group.
  const groups = new Map<string, number>();
  if (s.currentSavings > 0) groups.set("Cash", s.currentSavings);
  for (const h of s.externalHoldings) {
    if (h.amount > 0) groups.set(h.category, (groups.get(h.category) ?? 0) + h.amount);
  }
  const breakdown = [...groups.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <div className="mx-auto max-w-page px-4 pb-[88px] sm:px-6">
      <div className="grid gap-4 py-6 lg:grid-cols-[1.55fr_1fr] lg:gap-6">
        <div className="flex flex-col gap-4">
          {/* Tracking: where the money stands and where the pace leads. */}
          <section className={card}>
            <span className={sectionLabel}>Net worth</span>
            <div className="num mt-1.5 text-hero font-medium">{formatINR(total)}</div>
            <WealthPath series={series} />
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-caption text-text-3">Today</span>
              <span className="text-caption text-text-2">
                About <span className="num text-text">{formatINR(projected)}</span> in {YEARS_AHEAD} years at this pace. Not
                guaranteed.
              </span>
            </div>
          </section>

          {/* Breakdown: real categories only. */}
          {breakdown.length > 0 && (
            <section className={card}>
              <span className={sectionLabel}>Where it sits</span>
              <ul className="mt-3 flex flex-col gap-3">
                {breakdown.map(([label, v]) => (
                  <li key={label}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-support text-text">{label}</span>
                      <span className="num text-support font-medium">{formatINR(v)}</span>
                    </div>
                    <div className="mt-1.5 h-[3px] w-full overflow-hidden rounded-[2px] bg-surface-2">
                      <div className="h-full rounded-[2px] bg-text" style={{ width: `${(v / total) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className={card}>
            <Holdings />
          </section>
        </div>

        <aside className="flex flex-col gap-4">
          <section className={card}>
            <MoneyInput label="Monthly investing" value={s.monthlySip} onChange={actions.setSip} step={1000} min={0} max={1000000} compact />
            <div className="mt-4 border-t border-line pt-4">
              <MoneyInput label="Cash" value={s.currentSavings} onChange={actions.setSavings} step={25000} min={0} max={50000000} compact />
            </div>
          </section>

          <section className={card}>
            <Aggregation />
          </section>

          {/* Wealth tools land with the wealth engine phases. Listed, not faked. */}
          <section className={card}>
            <span className={sectionLabel}>Wealth tools</span>
            <ul className="mt-1 divide-y divide-line">
              {TOOLS.map((t) => (
                <li key={t} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="text-support text-text">{t}</span>
                  <span className="flex-none rounded-full bg-surface-2 px-2 py-0.5 text-index uppercase tracking-wide text-text-2">
                    Soon
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>

      <p className="pb-2 text-center text-caption text-text-3">Projections are illustrative and not investment advice.</p>
    </div>
  );
}
