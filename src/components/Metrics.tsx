import { useState } from "react";
import type { PlanGoal, PlanResult } from "../lib/types";
import { formatINR, formatPct, formatYears } from "../lib/format";
import { actions } from "../store";

const THIS_YEAR = new Date().getFullYear();

/**
 * The goal's status, one meaning per element. The bar is what is set aside
 * against what the goal will cost by its date, nothing else. The projection
 * is one sentence, with the fix as a button beside it. The rest are chips.
 * Technical numbers behind a tap.
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
  /** What this goal could take without touching the other goals: its own
      monthly plus whatever the pool leaves unassigned. */
  available: number;
  /** Goals ahead of this one that are taking the money, in priority order. */
  ahead: Array<{ name: string; year: number }>;
}

const chip = "num rounded-full border border-line px-2.5 py-1 text-caption text-text-2";

function listNames(items: Array<{ name: string }>): string {
  const names = items.map((i) => i.name);
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export default function Metrics({ r, goal, inflation, saved, monthly, monthlyShare, monthlyPool, available, ahead }: Props) {
  const [showNumbers, setShowNumbers] = useState(false);
  const year = THIS_YEAR + goal.horizonYears;
  const need = r.requiredCorpus;
  const savedPct = need > 0 ? Math.max(0, Math.min(1, saved / need)) * 100 : 0;
  const reachedEarly = r.onTrack && r.goalReachedMonth !== null && r.goalReachedMonth < r.months;
  // The one-tap fix: put the needed monthly on this goal, if that much is
  // free after the other goals. Otherwise the honest number is shown and
  // the choice is theirs: invest more, or move the date.
  const canFix = !r.onTrack && r.requiredSip <= available;
  const starved = monthly <= 0 && monthlyPool > 0 && ahead.length > 0;
  // A projected XIRR of nothing is noise, not a number: it appears once money is in.
  const hasXirr = r.totalInvested > 0 && Number.isFinite(r.xirr) && r.xirr !== 0;

  return (
    <div className="flex flex-col gap-4">
      {/* One bar, one meaning. */}
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="num text-row font-medium text-text">
            {formatINR(saved)} <span className="font-normal text-text-2">of {formatINR(need)}</span>
          </span>
          <span
            className="num text-caption text-text-2"
            title={`${formatINR(goal.targetToday)} today, at ${formatPct(inflation, 0)} inflation a year`}
          >
            needed by {year}
          </span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-2">
          <div className="h-full rounded-full bg-text transition-[width] duration-500 ease-out" style={{ width: `${savedPct}%` }} />
        </div>
      </div>

      {/* The projection in one sentence, with the fix beside it. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="num text-support text-text">
          At today's pace, <span className="font-medium">{formatINR(r.projectedCorpus)}</span> by {year}
          <span className="mx-1.5 text-text-3">·</span>
          {r.onTrack ? (
            <span className="font-medium text-pos">
              on track
              {reachedEarly && r.goalReachedMonth !== null ? `, there in ~${formatYears(r.goalReachedMonth / 12)}` : ""}
            </span>
          ) : (
            <span className="font-medium text-cau">{formatINR(Math.abs(r.gap))} short</span>
          )}
        </p>
        {!r.onTrack &&
          (canFix ? (
            <button
              type="button"
              onClick={() => actions.setGoalAmount(goal.id, Math.ceil(r.requiredSip))}
              className="num inline-flex h-8 items-center rounded-full bg-accent-fill px-3 text-caption font-medium text-on-accent transition hover:bg-accent-fill-hi"
            >
              Put {formatINR(r.requiredSip)}/mo on this
            </button>
          ) : (
            <span className="num text-caption text-text-2">
              Needs {formatINR(r.requiredSip)}/mo; {formatINR(available)} is free after your other goals.{" "}
              <button
                type="button"
                onClick={() => actions.setTab("money")}
                className="font-medium text-text underline underline-offset-2 transition hover:text-text-2"
              >
                Invest more →
              </button>{" "}
              or move the date.
            </span>
          ))}
      </div>

      {/* Why a goal is getting nothing: the money is going to nearer goals
          first. Said plainly, with the year the first of them is done. */}
      {starved && (
        <p className="text-caption text-text-2">
          Nothing flows here yet: your {formatINR(monthlyPool)} a month goes to {listNames(ahead)} first. It starts here when
          you raise the monthly amount, or once {ahead[0].name} is done ({ahead[0].year}).
        </p>
      )}

      {/* The small facts, as chips. */}
      <div className="flex flex-wrap gap-1.5">
        <span className={chip} title={`Target year ${year}`}>
          {formatYears(goal.horizonYears)} left
        </span>
        <span className={chip} title={`${Math.round(monthlyShare * 100)}% of your ${formatINR(monthlyPool)} a month`}>
          {formatINR(monthly)}/mo
        </span>
        <span className={chip} title="Your portfolio's historical pace">
          {formatPct(r.blendedReturn, 1)}/yr pace
        </span>
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
            ...(hasXirr ? [{ label: "XIRR", value: formatPct(r.xirr), hint: "Your true return after the timing of each deposit" }] : []),
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
