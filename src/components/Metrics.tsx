import { useMemo, useState } from "react";
import type { PlanGoal, PlanInputs, PlanResult } from "../lib/types";
import { formatINR, formatPct } from "../lib/format";
import { gapLevel, gapTone, type GapTone } from "../lib/gap";
import { inr } from "../lib/glue";
import { GOAL_MAP } from "../lib/goals";
import { educationNote, goalOptions } from "../lib/options";
import { reachedText } from "../lib/reached";
import { actions } from "../store";
import { btnGhost } from "../ui";
import { StatusIcon } from "./StatusPill";

const THIS_YEAR = new Date().getFullYear();

/**
 * The goal's status, one meaning per element. The bar is what is set aside
 * against what the goal will cost by its date, nothing else. The projection
 * is one sentence that ends in the status (icon, word and colour). Under
 * it, the ways to close a gap, each a button that does the thing. The small
 * facts are one sentence, and the technical numbers sit behind a tap.
 */
interface Props {
  r: PlanResult;
  inputs: PlanInputs;
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

const label = "text-support font-medium text-text-2";
const textLink = "text-support font-medium text-text underline underline-offset-2 transition hover:text-text-2";
const TONE_TEXT: Record<GapTone, string> = { pos: "text-pos", cau: "text-cau", neg: "text-neg" };

function listNames(items: Array<{ name: string }>): string {
  const names = items.map((i) => i.name);
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export default function Metrics({ r, inputs, goal, inflation, saved, monthly, monthlyShare, monthlyPool, available, ahead }: Props) {
  const [showNumbers, setShowNumbers] = useState(false);
  const year = THIS_YEAR + goal.horizonYears;
  const need = r.requiredCorpus;
  const savedPct = need > 0 ? Math.max(0, Math.min(1, saved / need)) * 100 : 0;
  const reachedEarly = r.onTrack && r.goalReachedMonth !== null && r.goalReachedMonth < r.months;
  // The moves that close a gap, each computed by the engine: the monthly
  // that gets there (one tap, if that much is free after the other goals),
  // the year today's pace does get there, and the smaller target today's
  // pace reaches by the date. The choice is theirs.
  const options = useMemo(
    () => (r.onTrack ? null : goalOptions(inputs, r, { dateFixed: GOAL_MAP[goal.id]?.dateFixed ?? false })),
    [goal.id, r.onTrack, r.requiredSip, r.realProjectedCorpus, inputs.targetToday, inputs.horizonYears, inputs.currentSavings, inputs.monthlySip, inputs.inflation, inputs.allocation],
  );
  const canFix = !r.onTrack && r.requiredSip <= available;
  const canLower = !!options && options.target >= goal.targetToday * 0.25 && options.target < goal.targetToday;
  const level = gapLevel(r);
  const context = educationNote(goal.id, level);
  const starved = monthly <= 0 && monthlyPool > 0 && ahead.length > 0;
  // A projected XIRR of nothing is noise, not a number: it appears once money is in.
  const hasXirr = r.totalInvested > 0 && Number.isFinite(r.xirr) && r.xirr !== 0;
  const maths = [
    { label: "Growth a year", value: formatPct(r.blendedReturn), hint: "A rough yearly average across your mix, from how it grew in the past." },
    ...(hasXirr ? [{ label: "Your return (XIRR)", value: formatPct(r.xirr), hint: "The yearly return once the timing of each deposit is counted." }] : []),
    { label: "Ups and downs (volatility)", value: formatPct(r.blendedVolatility, 0), hint: "Higher means bigger swings along the way." },
    { label: "Share of your monthly amount", value: `${Math.round(monthlyShare * 100)}%`, hint: `Of the ${formatINR(monthlyPool)} you add every month.` },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* One bar, one meaning. */}
      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <span className="num whitespace-nowrap text-row font-medium text-text">
            {formatINR(saved)} saved <span className="font-normal text-text-2">of {formatINR(need)}</span>
          </span>
          <span
            className="num whitespace-nowrap text-support text-text-2"
            title={`${formatINR(goal.targetToday)} today, at ${formatPct(inflation, 0)} inflation a year`}
          >
            needed by {year}
          </span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-2">
          <div className="h-full rounded-full bg-text transition-[width] duration-500 ease-out motion-reduce:transition-none" style={{ width: `${savedPct}%` }} />
        </div>
      </div>

      {/* The projection in one sentence, ending in the status. */}
      <p className="num text-body text-text">
        At this rate: <span className="font-medium">{inr(r.projectedCorpus)}</span> by {year}.{" "}
        <span className={`inline-flex items-center gap-1 whitespace-nowrap align-bottom font-medium ${TONE_TEXT[gapTone(level)]}`}>
          <StatusIcon level={level} size={16} />
          {r.onTrack ? "On track." : `${formatINR(Math.abs(r.gap))} short.`}
        </span>
        {reachedEarly && r.goalReachedMonth !== null ? <span className="text-text-2"> {reachedText(r.goalReachedMonth)}.</span> : null}
      </p>

      {/* The ways to close the gap, as buttons that do the thing. */}
      {!r.onTrack && options && (
        <div>
          <h3 className={label}>Ways to close the gap</h3>
          {!canFix && (
            <p className="num mt-1 max-w-[68ch] text-pretty text-support text-text-2">
              This goal needs {inr(options.monthly)} a month. {inr(available)} is free after your other goals.
            </p>
          )}
          <div className="mt-2 grid gap-2 sm:flex sm:flex-wrap">
            {canFix ? (
              <button type="button" onClick={() => actions.setGoalAmount(goal.id, options.monthly)} className={`${btnGhost} num`}>
                Put in {formatINR(options.monthly)} a month
              </button>
            ) : (
              <button
                type="button"
                // The monthly sheet, prefilled so this goal gets what it
                // needs, with every goal's new date shown before saving.
                onClick={() =>
                  actions.openSheet({
                    kind: "monthly",
                    goalId: goal.id,
                    prefill: Math.max(0, Math.round(monthlyPool + options.monthly - monthly)),
                  })
                }
                className={btnGhost}
              >
                Put in more
              </button>
            )}
            {options.year !== null && (
              <button
                type="button"
                onClick={() => actions.setGoalTenure(goal.id, options.year!)}
                title={`At this rate this goal is on track by ${THIS_YEAR + options.year}`}
                className={`${btnGhost} num`}
              >
                Move to {THIS_YEAR + options.year}
              </button>
            )}
            {canLower && (
              <button
                type="button"
                onClick={() => actions.setGoalTarget(goal.id, options.target)}
                title={`At this rate you reach ${formatINR(options.target)} in today's money by ${year}`}
                className={`${btnGhost} num`}
              >
                Aim for {formatINR(options.target)} instead
              </button>
            )}
          </div>
        </div>
      )}
      {context && <p className="max-w-[68ch] text-pretty text-support text-text-2">{context}</p>}

      {/* Why a goal is getting nothing: the money is going to nearer goals
          first. Said plainly, with the year the first of them is done. */}
      {starved && (
        <p className="num max-w-[68ch] text-pretty text-support text-text-2">
          No money reaches this goal yet. Your {inr(monthlyPool)} a month goes to {listNames(ahead)} first. It starts here when the
          monthly amount goes up, or once {ahead[0].name} is done ({ahead[0].year}).
        </p>
      )}

      {/* The small facts, as one sentence. The technical numbers sit behind a tap. */}
      <div>
        <p className="num text-pretty text-support text-text-2">
          {goal.horizonYears} {goal.horizonYears === 1 ? "year" : "years"} to go, at {inr(monthly)} a month. Assumes{" "}
          {formatPct(r.blendedReturn, 1)} growth a year.
        </p>
        <button type="button" onClick={() => setShowNumbers((v) => !v)} aria-expanded={showNumbers} className={`${textLink} inline-flex h-11 items-center`}>
          {showNumbers ? "Hide the maths" : "Show the maths"}
        </button>
        {showNumbers && (
          <dl className="mt-1 divide-y divide-line border-y border-line">
            {maths.map((f) => (
              <div key={f.label} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 py-2.5">
                <dt className="text-support text-text">{f.label}</dt>
                <dd className="num row-span-2 self-center text-row font-medium text-text">{f.value}</dd>
                <dd className="text-support text-text-2">{f.hint}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  );
}
