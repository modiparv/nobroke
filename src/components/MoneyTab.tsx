import { useState } from "react";
import { blendedReturn, computePlan, projectionSeries } from "../lib/finance";
import { formatINR, formatPct } from "../lib/format";
import { inr } from "../lib/glue";
import { niceTicks, shareLabel, yearTicks } from "../lib/goalPaths";
import { categoryCode } from "../lib/holdings";
import { runwayLabel, runwayMonths } from "../lib/runway";
import { C } from "../lib/theme";
import type { ProjectionPoint } from "../lib/types";
import {
  actions,
  capitalForGoal,
  goalMonthly,
  goalShareFraction,
  goalsByPriority,
  holdingsTotal,
  planInputsForGoal,
  totalCapital,
  useStore,
} from "../store";
import { gapLevel } from "../lib/gap";
import { FOCUS } from "../lib/links";
import { useFocus } from "../lib/useFocus";
import { btnGhost, card, sectionLabel } from "../ui";
import { useChartWidth, useTextMeasure } from "./Chart";
import Holdings from "./Holdings";
import MoneyInput from "./MoneyInput";
import StatusPill, { StatusIcon } from "./StatusPill";

/**
 * Money: the tab for everything you have, earn and spend.
 *
 * The page opens on the one total and where it could go if nothing changes
 * (a projection line from the real engine). Under it, on the left, is where
 * the money is and the list of investments; on the right, the monthly
 * numbers and the cash. The app stores no historical snapshots yet, so the
 * chart is a forward path, labelled as such, never an invented history.
 * Loans are not recorded anywhere yet, so the total is called what it is
 * (cash and investments) and not a net worth.
 */

const YEARS_AHEAD = 10;

/** The two columns every block on this page shares (the Portfolio tab uses the same ones). */
const columns = "grid gap-x-6 gap-y-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]";
const cardTitle = "text-section font-medium text-text";
const textLink = "text-support font-medium text-text underline underline-offset-2 transition-colors hover:text-text-2";

const NBSP = "\u00a0";
const TICK_REM = 0.75;
const LABEL_REM = 0.875;

/**
 * The total over the next ten years if nothing changes, drawn like the
 * goal chart on the plan: rupees up the side, calendar years along the
 * bottom, and the amount it reaches written at the end of the line. The
 * line starts at the total written above the chart.
 */
function WealthPath({ series, years }: { series: ProjectionPoint[]; years: number }) {
  const [ref, width] = useChartWidth<HTMLDivElement>(480);
  const { measure, rootPx } = useTextMeasure();
  if (series.length < 2) return null;
  const narrow = width < 480;
  const H = 190;
  const tickPx = TICK_REM * rootPx;
  const labelPx = LABEL_REM * rootPx;
  const maxX = series.length - 1;
  const first = series[0].value;
  const last = series[maxX].value;
  const maxY = Math.max(...series.map((p) => p.value), 1) * 1.08;

  const yTicks = [0, ...niceTicks(maxY, 4)];
  const yTickText = yTicks.map((v) => formatINR(v));
  const baseYear = new Date().getFullYear();
  const xTicks = yearTicks(baseYear, years, narrow ? 6 : 8);
  const endYear = baseYear + years;
  const PAD = {
    // Room for the end amount, which sits above the last dot.
    t: Math.round(labelPx * 1.4) + 10,
    r: Math.max(18, Math.ceil(measure(String(endYear), TICK_REM) / 2) + 3),
    b: Math.round(tickPx * 1.3) + 16,
    l: Math.max(22, Math.ceil(Math.max(0, ...yTickText.map((t) => measure(t, TICK_REM)))) + 14),
  };
  const PW = Math.max(40, width - PAD.l - PAD.r);
  const PH = H - PAD.t - PAD.b;
  const x = (i: number) => PAD.l + (i / maxX) * PW;
  const y = (v: number) => PAD.t + PH - (Math.min(Math.max(v, 0), maxY) / maxY) * PH;

  const line = series.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const base = (PAD.t + PH).toFixed(1);
  const area = `${line} L${x(maxX).toFixed(1)},${base} L${x(0).toFixed(1)},${base} Z`;
  // The page's own ground, so a label stays readable where it crosses a rule.
  const ground = "rgb(var(--bg))";
  const halo = { paintOrder: "stroke", stroke: ground, strokeWidth: 4, strokeLinejoin: "round" } as const;
  const firstText = formatINR(first);
  const lastText = formatINR(last);

  return (
    <div ref={ref} className="mt-3 w-full min-w-0">
      <svg
        width={width}
        height={H}
        viewBox={`0 0 ${width} ${H}`}
        className="block h-auto w-full"
        role="img"
        aria-label={`${firstText} today grows to about ${lastText} by ${endYear} if nothing changes.`}
      >
        {yTicks.map((v, i) => (
          <g key={v}>
            <line x1={PAD.l} y1={y(v)} x2={PAD.l + PW} y2={y(v)} stroke={v === 0 ? "rgb(var(--line-2))" : C.line} strokeWidth="1" />
            <text x={PAD.l - 10} y={y(v)} dy="0.35em" textAnchor="end" fill={C.muted} className="num" style={{ fontSize: `${TICK_REM}rem` }}>
              {yTickText[i]}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text
            key={t.year}
            x={x((t.offset / years) * maxX)}
            y={PAD.t + PH + 13 + tickPx * 0.8}
            textAnchor="middle"
            fill={C.muted}
            className="num"
            style={{ fontSize: `${TICK_REM}rem` }}
          >
            {t.year}
          </text>
        ))}

        <path d={area} fill={C.brand} opacity="0.06" />
        <path d={line} fill="none" stroke={C.brand} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(0)} cy={y(first)} r="3.5" fill={C.brand} />
        <circle cx={x(maxX)} cy={y(last)} r="5.5" fill={C.brand} stroke={ground} strokeWidth="2" />

        <text x={x(maxX) + 6} y={y(last) - 13} textAnchor="end" fill={C.ink} className="num font-medium" style={{ fontSize: `${LABEL_REM}rem`, ...halo }}>
          {lastText}
        </text>
      </svg>
    </div>
  );
}

/** A row that opens something else: the small mark at its right edge. */
function Chevron() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="flex-none text-text-3">
      <path d="M6 3.5L10.5 8 6 12.5" />
    </svg>
  );
}

export default function MoneyTab() {
  const s = useStore();
  const [view, setView] = useState<"location" | "goal">("location");
  const invested = holdingsTotal(s);
  const total = totalCapital(s);
  // Every month: what comes in, what goes out, what is invested, and what is
  // left with no plan. The last sentence only appears when it is above zero.
  const leftover = Math.max(0, s.monthlyIncome - s.monthlyExpenses);
  const unplanned = Math.max(0, leftover - s.monthlySip);
  // Links from the plan land on the cash field or the monthly numbers.
  const cashFocus = useFocus(FOCUS.cash);
  const monthFocus = useFocus(FOCUS.everyMonth);

  const growth = blendedReturn(s.portfolio);
  const series = projectionSeries(
    {
      targetToday: 0,
      horizonYears: YEARS_AHEAD,
      currentSavings: total,
      monthlySip: s.monthlySip,
      inflation: s.inflation,
      allocation: s.portfolio,
    },
    growth,
  );
  const projected = series[series.length - 1]?.value ?? total;
  const runway = runwayMonths(s.currentSavings, s.monthlyExpenses);

  // Breakdown by category, from real data only: cash plus each holding group.
  const groups = new Map<string, number>();
  if (s.currentSavings > 0) groups.set("Cash", s.currentSavings);
  for (const h of s.externalHoldings) {
    if (h.amount > 0) groups.set(h.category, (groups.get(h.category) ?? 0) + h.amount);
  }
  const breakdown = [...groups.entries()].sort((a, b) => b[1] - a[1]);

  const facts = [
    { label: "In the bank", text: formatINR(s.currentSavings) },
    { label: "Invested", text: formatINR(invested) },
    { label: "Added every month", text: formatINR(s.monthlySip) },
  ];

  return (
    <div className="mx-auto max-w-page px-4 pb-[88px] sm:px-6">
      {/* Orientation, one line: what this page holds, and where it feeds. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 pt-3">
        <p className="text-pretty text-support text-text-2">What you have, earn and spend. Change a number here and your plan updates.</p>
        <button type="button" onClick={() => actions.setTab("plan")} className={`${textLink} inline-flex min-h-11 items-center`}>
          See your plan
        </button>
      </div>

      {/* 1. What do I have, and where is it going. Open on the page, not in
          a card: the one total on the left, its ten-year path on the right. */}
      <div className={`${columns} pb-2 pt-2 lg:pb-4`}>
        <section className="flex min-w-0 flex-col">
          <h2 className={sectionLabel}>Cash and investments</h2>
          <p className="num mt-1 text-[2.25rem] font-medium leading-[1.1] tracking-[-0.025em] text-text sm:text-[2.75rem]">
            {formatINR(total, { compact: false })}
          </p>
          <div className="min-h-4 flex-1" />
          <dl className="divide-y divide-line border-y border-line sm:grid sm:grid-cols-3 sm:gap-x-6 sm:divide-y-0 sm:border-b-0">
            {facts.map((f) => (
              <div key={f.label} className="flex items-baseline justify-between gap-4 py-2 sm:block sm:py-3">
                <dt className="text-support text-text-2">{f.label}</dt>
                <dd className="num whitespace-nowrap text-row font-medium text-text sm:mt-0.5">{f.text}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="min-w-0 pt-2 lg:pt-0">
          {total > 0 || s.monthlySip > 0 ? (
            <>
              <h2 className="text-pretty text-body text-text">
                Keep this up and it could be <span className="num font-medium">{inr(projected)}</span> in{NBSP}
                {YEARS_AHEAD}
                {NBSP}years.
              </h2>
              <p className="num mt-1 text-pretty text-support text-text-2">
                {s.monthlySip > 0
                  ? `Assumes ${inr(s.monthlySip)} added every month and ${formatPct(growth, 1)} growth a year.`
                  : `Assumes ${formatPct(growth, 1)} growth a year and nothing added.`}{" "}
                {/* Kept whole, so it moves to the next line as one sentence. */}
                <span className="inline-block">Not adjusted for rising prices.</span>
              </p>
              <WealthPath series={series} years={YEARS_AHEAD} />
            </>
          ) : (
            <p className="text-pretty text-body text-text-2">
              Nothing here yet. Add your cash, an investment or a monthly amount below to see where it could be in {YEARS_AHEAD} years.
            </p>
          )}
        </section>
      </div>

      <div className={`${columns} py-4`}>
        <div className="flex min-w-0 flex-col gap-4">
          {/* 2. Where does it sit: one card, two lenses. */}
          {(breakdown.length > 0 || s.goals.length > 0) && (
            <section className={card}>
              <div className="-mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <h2 className={cardTitle}>Where it is</h2>
                <div className="flex items-center gap-0.5 rounded-full bg-surface-2 p-0.5" role="group" aria-label="Show your money by">
                  {(["location", "goal"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setView(v)}
                      aria-pressed={view === v}
                      className={`inline-flex h-11 items-center whitespace-nowrap rounded-full px-4 text-support transition-colors ${
                        view === v ? "bg-accent-fill text-on-accent" : "text-text-2 hover:text-text"
                      }`}
                    >
                      {v === "location" ? "By type" : "By goal"}
                    </button>
                  ))}
                </div>
              </div>

              {view === "location" ? (
                breakdown.length > 0 ? (
                  <ul className="mt-4 flex flex-col gap-4">
                    {breakdown.map(([label, v]) => (
                      <li key={label}>
                        <div className="flex items-center justify-between gap-3">
                          <span className="flex min-w-0 items-center gap-2.5">
                            <span className="h-2.5 w-2.5 flex-none rounded-[3px]" style={{ background: categoryCode(label).ink }} aria-hidden />
                            <span className="truncate text-row text-text">{label}</span>
                          </span>
                          <span className="num flex-none whitespace-nowrap">
                            <span className="text-support text-text-2">{shareLabel(total > 0 ? v / total : 0)}</span>
                            <span className="ml-3 inline-block min-w-[4.5rem] text-right text-row font-medium text-text">{formatINR(v)}</span>
                          </span>
                        </div>
                        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                          <div className="h-full rounded-full" style={{ width: `max(3px, ${total > 0 ? (v / total) * 100 : 0}%)`, background: categoryCode(label).ink }} />
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-pretty text-support text-text-2">Add cash under In the bank, or an investment below, to see this.</p>
                )
              ) : (
                <ul className="mt-3 divide-y divide-line border-t border-line">
                  {goalsByPriority(s).map((g) => {
                    const share = goalShareFraction(s, g.id);
                    const level = gapLevel(computePlan(planInputsForGoal(s, g)));
                    return (
                      <li key={g.id}>
                        {/* The row IS the link: this goal's workbench on the plan,
                            scrolled to and lit up. */}
                        <button
                          type="button"
                          onClick={() => {
                            actions.setCurrentGoal(g.id);
                            actions.setTab("plan", { focus: FOCUS.goalDetail });
                          }}
                          title={`Open ${g.name} on the plan`}
                          className="-mx-2 flex min-h-11 w-[calc(100%+1rem)] items-center gap-2 rounded-control px-2 py-2.5 text-left transition-colors hover:bg-surface-2 focus-visible:-outline-offset-2"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="flex items-baseline justify-between gap-3">
                              <span className="truncate text-row font-medium text-text">{g.name}</span>
                              <span className="num flex-none whitespace-nowrap text-row font-medium text-text">{inr(capitalForGoal(s, g.id))} saved</span>
                            </span>
                            <span className="mt-1 flex items-center justify-between gap-3">
                              <span className="flex min-w-0 items-center gap-2.5">
                                <StatusPill level={level} />
                                <span className="num hidden truncate text-support text-text-2 sm:inline">{Math.round(share * 100)}% of your monthly amount</span>
                              </span>
                              <span className="num flex-none whitespace-nowrap text-support text-text-2">{inr(goalMonthly(s, g.id))} a month</span>
                            </span>
                          </span>
                          <Chevron />
                        </button>
                      </li>
                    );
                  })}
                  {s.goals.length === 0 && (
                    <li>
                      <button type="button" onClick={() => actions.setTab("plan")} className={`${textLink} inline-flex min-h-11 items-center`}>
                        Add a goal on the plan
                      </button>
                    </li>
                  )}
                </ul>
              )}
            </section>
          )}

          <section className={card}>
            <Holdings />
          </section>
        </div>

        <aside className="flex min-w-0 flex-col gap-4">
          <section ref={monthFocus.ref} className={`${card} ${monthFocus.active ? "focus-flash" : ""}`}>
            <h2 className={cardTitle}>Every month</h2>
            <div className="mt-3 flex flex-col gap-3">
              <MoneyInput label="Money in" value={s.monthlyIncome} onChange={actions.setIncome} step={5000} min={0} max={10000000} compact row />
              <MoneyInput label="Spent" value={s.monthlyExpenses} onChange={actions.setExpenses} step={5000} min={0} max={10000000} compact row />
              <MoneyInput label="Invested" value={s.monthlySip} onChange={actions.setSip} step={1000} min={0} max={1000000} compact row />
            </div>
            {s.monthlyIncome > 0 &&
              (s.monthlySip > leftover ? (
                <p className="mt-4 flex items-start gap-2 text-pretty text-support text-cau">
                  <StatusIcon level="far_short" size={16} className="mt-0.5" />
                  <span>You invest more than what is left after expenses. Check these numbers.</span>
                </p>
              ) : (
                <p className="num mt-4 text-pretty text-support text-text-2">
                  {inr(leftover)} is left after expenses. {inr(s.monthlySip)} goes into investments.
                  {unplanned > 0 ? ` ${inr(unplanned)} has no plan yet.` : ""}
                </p>
              ))}
            {/* The money with no plan yet, into the monthly sheet: every
                goal's new verdict shows before it is saved. */}
            {s.monthlyIncome > 0 && unplanned > 0 && (
              <button
                type="button"
                onClick={() => actions.openSheet({ kind: "monthly", prefill: s.monthlySip + unplanned })}
                aria-haspopup="dialog"
                className={`${btnGhost} num mt-3 w-full sm:w-auto`}
              >
                Invest the {inr(unplanned)}
              </button>
            )}
          </section>

          <section ref={cashFocus.ref} className={`${card} ${cashFocus.active ? "focus-flash" : ""}`}>
            <h2 className={cardTitle}>In the bank</h2>
            <div className="mt-3">
              <MoneyInput label="Cash" value={s.currentSavings} onChange={actions.setSavings} step={25000} min={0} max={50000000} compact row />
            </div>
            {runway !== null && (
              <p className="num mt-3 text-support text-text-2">
                Cash lasts <span className="font-medium text-text">{runwayLabel(runway)}</span> at what you spend now.
              </p>
            )}
          </section>
        </aside>
      </div>

      <p className="text-balance pb-2 pt-1 text-center text-support text-text-2">Projections are illustrative and not investment advice.</p>
    </div>
  );
}
