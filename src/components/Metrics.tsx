import { useState } from "react";
import type { PlanGoal, PlanResult } from "../lib/types";
import { requiredSip } from "../lib/finance";
import { formatINR, formatPct, formatYears } from "../lib/format";
import { actions } from "../store";

const THIS_YEAR = new Date().getFullYear();

/**
 * The goal brief, drawn rather than written. One verdict line with the fix
 * as a button; then the journey bar — what is set aside, what today's pace
 * adds by the date, what is still missing — against what the goal will
 * cost; then the four small facts as chips. Technical numbers behind a tap.
 */
interface Props {
  r: PlanResult;
  goal: PlanGoal;
  inflation: number;
  /** Capital already set aside for this goal (its share of everything held). */
  saved: number;
  /** Monthly amount flowing to this goal, and its share of the monthly pool. */
  monthly: number;
  monthlyShare: number;
  monthlyPool: number;
}

export default function Metrics({ r, goal, inflation, saved, monthly, monthlyShare, monthlyPool }: Props) {
  const [showNumbers, setShowNumbers] = useState(false);
  const year = THIS_YEAR + goal.horizonYears;
  const need = r.requiredCorpus;
  const pct = (v: number) => (need > 0 ? Math.max(0, Math.min(1, v / need)) * 100 : 0);
  const savedPct = pct(saved);
  const expectedPct = pct(r.projectedCorpus);
  // The cost of waiting: same target, same date, one year less of investing.
  const delayedSip =
    goal.horizonYears > 1 ? requiredSip(need, saved, r.blendedReturn, goal.horizonYears - 1) : null;
  const reachedEarly = r.onTrack && r.goalReachedMonth !== null && r.goalReachedMonth < r.months;
  // The one-tap fix: put the needed monthly on this goal, if the pool allows.
  const canFix = !r.onTrack && r.requiredSip <= monthlyPool;

  const chips: Array<{ text: string; hint: string }> = [
    { text: `${formatYears(goal.horizonYears)} left`, hint: `Target year ${year}` },
    {
      text: `${formatINR(monthly)}/mo`,
      hint: `${Math.round(monthlyShare * 100)}% of your ${formatINR(monthlyPool)} a month`,
    },
    { text: `${formatPct(r.blendedReturn, 1)}/yr pace`, hint: "Your portfolio's historical pace" },
    ...(delayedSip !== null
      ? [
          {
            text: `wait a year: ${formatINR(delayedSip)}/mo`,
            hint: `Monthly needed if you start a year later, against ${formatINR(r.requiredSip)}/mo now`,
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* The verdict, and the fix beside it. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="num text-support text-text">
          {r.onTrack ? (
            <>
              <span className="font-medium text-pos">On track</span>
              <span className="mx-1.5 text-text-3">·</span>
              {formatINR(r.gap)} to spare
              {reachedEarly && r.goalReachedMonth !== null && (
                <>
                  <span className="mx-1.5 text-text-3">·</span>
                  crosses the line in ~{formatYears(r.goalReachedMonth / 12)}
                </>
              )}
            </>
          ) : (
            <>
              <span className="font-medium text-cau">Short by {formatINR(Math.abs(r.gap))}</span>
              <span className="mx-1.5 text-text-3">·</span>
              {formatINR(r.requiredSip)}/mo gets there
            </>
          )}
        </p>
        {!r.onTrack &&
          (canFix ? (
            <button
              type="button"
              onClick={() => actions.setGoalAmount(goal.id, Math.ceil(r.requiredSip))}
              className="inline-flex h-8 items-center rounded-full bg-accent-fill px-3 text-caption font-medium text-on-accent transition hover:bg-accent-fill-hi"
            >
              Put {formatINR(r.requiredSip)}/mo on this
            </button>
          ) : (
            <button
              type="button"
              onClick={() => actions.setTab("money")}
              className="text-caption font-medium text-text underline underline-offset-2 transition hover:text-text-2"
            >
              Needs more than you invest monthly · raise it →
            </button>
          ))}
      </div>

      {/* The journey bar: set aside, expected by the date, needed. */}
      <div>
        <div
          className="relative h-2.5 w-full overflow-hidden rounded-full bg-surface-2"
          title={`Set aside ${formatINR(saved)} · expected ${formatINR(r.projectedCorpus)} by ${year} · needs ${formatINR(need)}`}
        >
          <div className="absolute inset-y-0 left-0 rounded-full bg-text/25 transition-[width] duration-500 ease-out" style={{ width: `${expectedPct}%` }} />
          <div className="absolute inset-y-0 left-0 rounded-full bg-text transition-[width] duration-500 ease-out" style={{ width: `${savedPct}%` }} />
        </div>
        <dl className="mt-2 grid grid-cols-3 gap-x-3">
          <div className="min-w-0">
            <dt className="flex items-center gap-1.5 text-eyebrow uppercase text-text-3">
              <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-text" />
              Set aside
            </dt>
            <dd className="num mt-0.5 truncate text-row font-medium text-text">{formatINR(saved)}</dd>
          </div>
          <div className="min-w-0 text-center">
            <dt className="flex items-center justify-center gap-1.5 text-eyebrow uppercase text-text-3">
              <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-text/25" />
              By {year}
            </dt>
            <dd className="num mt-0.5 truncate text-row font-medium text-text">{formatINR(r.projectedCorpus)}</dd>
          </div>
          <div className="min-w-0 text-right">
            <dt className="text-eyebrow uppercase text-text-3" title={`${formatINR(goal.targetToday)} today, at ${formatPct(inflation, 0)} inflation a year`}>
              Needed
            </dt>
            <dd className="num mt-0.5 truncate text-row font-medium text-text">{formatINR(need)}</dd>
          </div>
        </dl>
      </div>

      {/* The small facts, as chips. */}
      <div className="flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <span key={c.text} title={c.hint} className="num rounded-full border border-line px-2.5 py-1 text-caption text-text-2">
            {c.text}
          </span>
        ))}
        <button
          type="button"
          onClick={() => setShowNumbers((v) => !v)}
          className="rounded-full border border-dashed border-line px-2.5 py-1 text-caption text-text-2 transition hover:border-line-2 hover:text-text"
        >
          {showNumbers ? "hide technical" : "technical ▾"}
        </button>
      </div>
      {showNumbers && (
        <dl className="grid grid-cols-3 gap-x-4">
          {[
            { label: "Growth / yr", value: formatPct(r.blendedReturn), hint: "A rough yearly average across your portfolio" },
            { label: "XIRR", value: formatPct(r.xirr), hint: "Your true return after the timing of each deposit" },
            { label: "Volatility", value: formatPct(r.blendedVolatility, 0), hint: "Higher means bigger ups and downs along the way" },
          ].map((f) => (
            <div key={f.label} className="min-w-0" title={f.hint}>
              <dt className="truncate text-eyebrow uppercase text-text-3">{f.label}</dt>
              <dd className="num mt-0.5 truncate text-row font-medium text-text">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
