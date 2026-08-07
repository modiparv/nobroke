import { useEffect, useState } from "react";
import { blendedReturn, computePlan, projectionSeries } from "../lib/finance";
import { formatINR } from "../lib/format";
import { fetchMacro, type MacroData } from "../lib/macroApi";
import {
  actions,
  goalMonthly,
  goalShareFraction,
  goalsByPriority,
  holdingsTotal,
  planInputsForGoal,
  totalCapital,
  useStore,
} from "../store";
import { card, sectionLabel } from "../ui";
import Aggregation from "./Aggregation";
import GoalsChart from "./GoalsChart";
import Holdings from "./Holdings";
import MoneyInput from "./MoneyInput";

/** The macro backdrop: four numbers an advisor keeps on the desk, each with
 *  its own source and vintage. Renders nothing until data exists. */
function MacroCard() {
  const [macro, setMacro] = useState<MacroData | null>(null);
  useEffect(() => {
    void fetchMacro().then(setMacro);
  }, []);
  if (!macro) return null;
  return (
    <section className={card}>
      <span className={sectionLabel}>Macro backdrop</span>
      <ul className="mt-1 divide-y divide-line">
        {macro.indicators.map((i) => (
          <li key={i.key} className="flex items-baseline justify-between gap-3 py-2">
            <span className="text-support text-text">{i.label}</span>
            <span className="num text-support font-medium">
              {i.value}
              {i.unit}
              <span className="ml-1.5 text-caption font-normal text-text-2">{i.as_of}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-caption text-text-2">
        {[...new Set(macro.indicators.map((i) => i.source))].join(" · ")}. Inflation here sets your plan's default.
      </p>
    </section>
  );
}

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
  const [view, setView] = useState<"location" | "goal">("location");
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
          {/* 1. What do I have: one primary number, its split, its path. */}
          <section className={card}>
            <span className={sectionLabel}>Net worth</span>
            <div className="num mt-1.5 text-hero font-medium">{formatINR(total)}</div>
            <div className="num mt-1 flex flex-wrap gap-x-4 text-caption text-text-2">
              <span>Cash {formatINR(s.currentSavings)}</span>
              <span>Invested {formatINR(invested)}</span>
              <span>{formatINR(s.monthlySip)}/mo going in</span>
            </div>
            <WealthPath series={series} />
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-caption text-text-3">Today</span>
              <span className="text-caption text-text-2">
                About <span className="num text-text">{formatINR(projected)}</span> in {YEARS_AHEAD} years at this pace.
              </span>
            </div>
          </section>

          {/* 2. Where is it going: every goal's trajectory. */}
          <GoalsChart />

          {/* 3. Where does it sit: one card, two lenses. */}
          {(breakdown.length > 0 || s.goals.length > 0) && (
            <section className={card}>
              <div className="flex items-center justify-between gap-3">
                <span className={sectionLabel}>Breakdown</span>
                <div className="flex items-center gap-0.5 rounded-full bg-surface-2 p-0.5">
                  {(["location", "goal"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setView(v)}
                      className={`inline-flex h-6 items-center rounded-full px-2.5 text-caption transition ${
                        view === v ? "bg-surface text-text" : "text-text-2 hover:text-text"
                      }`}
                    >
                      {v === "location" ? "By location" : "By goal"}
                    </button>
                  ))}
                </div>
              </div>

              {view === "location" ? (
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
                  {breakdown.length === 0 && <p className="text-caption text-text-2">Add cash or holdings to see this.</p>}
                </ul>
              ) : (
                <ul className="mt-1 divide-y divide-line">
                  {goalsByPriority(s).map((g) => {
                    const share = goalShareFraction(s, g.id);
                    const onTrack = computePlan(planInputsForGoal(s, g)).onTrack;
                    return (
                      <li key={g.id} className="flex items-center justify-between gap-3 py-2.5">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-support font-medium text-text">{g.name}</span>
                            <span
                              className={`flex-none rounded-full px-1.5 py-px text-index uppercase tracking-wide ${
                                onTrack ? "bg-pos-bg text-pos" : "bg-cau-bg text-cau"
                              }`}
                            >
                              {onTrack ? "On track" : "Short"}
                            </span>
                          </div>
                          <span className="num text-caption text-text-2">{Math.round(share * 100)}% of the pool</span>
                        </div>
                        <div className="flex-none text-right">
                          <div className="num text-support font-medium">{formatINR(totalCapital(s) * share)}</div>
                          <div className="num text-caption text-text-2">{formatINR(goalMonthly(s, g.id))}/mo</div>
                        </div>
                      </li>
                    );
                  })}
                  {s.goals.length === 0 && <p className="py-2 text-caption text-text-2">Add a goal to see this.</p>}
                </ul>
              )}
            </section>
          )}

          <section className={card}>
            <Holdings />
          </section>
        </div>

        <aside className="flex flex-col gap-4">
          <section className={card}>
            <span className={sectionLabel}>Your numbers</span>
            <div className="mt-3" />
            <MoneyInput label="Monthly income" value={s.monthlyIncome} onChange={actions.setIncome} step={5000} min={0} max={10000000} compact />
            <div className="mt-4 border-t border-line pt-4">
              <MoneyInput label="Monthly spend" value={s.monthlyExpenses} onChange={actions.setExpenses} step={5000} min={0} max={10000000} compact />
            </div>
            <div className="mt-4 border-t border-line pt-4">
              <MoneyInput label="Monthly investing" value={s.monthlySip} onChange={actions.setSip} step={1000} min={0} max={1000000} compact />
            </div>
            <div className="mt-4 border-t border-line pt-4">
              <MoneyInput label="Cash" value={s.currentSavings} onChange={actions.setSavings} step={25000} min={0} max={50000000} compact />
            </div>
            {s.monthlyIncome > 0 &&
              (s.monthlySip > Math.max(0, s.monthlyIncome - s.monthlyExpenses) ? (
                <p className="mt-3 text-caption text-cau">
                  You invest more than what is left after spending. Worth a look.
                </p>
              ) : (
                <p className="mt-3 text-caption text-text-2">
                  {formatINR(Math.max(0, s.monthlyIncome - s.monthlyExpenses))} left after spending. You put{" "}
                  {formatINR(s.monthlySip)} of it to work.
                </p>
              ))}
          </section>

          <MacroCard />

          {/* Everything not yet live sits in ONE card: connections to come
              plus the wealth tools landing with the engine phases. Listed,
              never faked. */}
          <section className={card}>
            <Aggregation />
            <div className="mt-4 border-t border-line pt-3">
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
            </div>
          </section>
        </aside>
      </div>

      <p className="pb-2 text-center text-caption text-text-2">Projections are illustrative and not investment advice.</p>
    </div>
  );
}
