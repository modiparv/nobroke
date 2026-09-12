import { useState } from "react";
import type { PlanGoal, PlanResult } from "../lib/types";
import { requiredSip } from "../lib/finance";
import { formatINR, formatPct, formatYears } from "../lib/format";
import { actions } from "../store";

const THIS_YEAR = new Date().getFullYear();

/**
 * The goal brief, told in three lines the way a wealth manager tells it:
 * where you are, where today's pace lands you, and the gap with its fix.
 * Each line carries one number and its meaning; the bar above them is the
 * same story drawn. Everything that explains the numbers (time left, the
 * pace, inflation, the cost of waiting, the technical figures) waits
 * behind "Why these numbers".
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

function Dot({ tone }: { tone: "saved" | "expected" | "gap" }) {
  const cls =
    tone === "saved" ? "bg-text" : tone === "expected" ? "bg-text/25" : "border border-line-2 bg-transparent";
  return <span aria-hidden className={`mt-[7px] h-2 w-2 flex-none rounded-full ${cls}`} />;
}

export default function Metrics({ r, goal, inflation, saved, monthly, monthlyShare, monthlyPool }: Props) {
  const [showWhy, setShowWhy] = useState(false);
  const year = THIS_YEAR + goal.horizonYears;
  const need = r.requiredCorpus;
  const pct = (v: number) => (need > 0 ? Math.max(0, Math.min(1, v / need)) * 100 : 0);
  const gapAbs = Math.abs(r.gap);
  const reachedEarly = r.onTrack && r.goalReachedMonth !== null && r.goalReachedMonth < r.months;
  // The one-tap fix: put the needed monthly on this goal, if the pool allows.
  const canFix = !r.onTrack && r.requiredSip <= monthlyPool;
  // The cost of waiting: same target, same date, one year less of investing.
  const delayedSip =
    goal.horizonYears > 1 ? requiredSip(need, saved, r.blendedReturn, goal.horizonYears - 1) : null;

  const strong = "num font-medium text-text";

  return (
    <div className="flex flex-col gap-3">
      {/* The story, drawn: set aside (dark), expected by the date (light),
          still missing (grey), all against what the goal will cost. */}
      <div
        className="relative h-2.5 w-full overflow-hidden rounded-full bg-surface-2"
        title={`Set aside ${formatINR(saved)} · expected ${formatINR(r.projectedCorpus)} by ${year} · needs ${formatINR(need)}`}
      >
        <div className="absolute inset-y-0 left-0 rounded-full bg-text/25 transition-[width] duration-500 ease-out" style={{ width: `${pct(r.projectedCorpus)}%` }} />
        <div className="absolute inset-y-0 left-0 rounded-full bg-text transition-[width] duration-500 ease-out" style={{ width: `${pct(saved)}%` }} />
      </div>

      {/* The story, told. */}
      <ol className="flex flex-col gap-2 text-support leading-relaxed text-text-2">
        <li className="flex gap-2.5">
          <Dot tone="saved" />
          <span>
            Set aside so far: <span className={strong}>{formatINR(saved)}</span>.
          </span>
        </li>
        <li className="flex gap-2.5">
          <Dot tone="expected" />
          <span>
            At <span className={strong}>{formatINR(monthly)}/mo</span>, you'll have about{" "}
            <span className={strong}>{formatINR(r.projectedCorpus)}</span> by {year}.
          </span>
        </li>
        <li className="flex gap-2.5">
          <Dot tone="gap" />
          <span>
            The goal will cost <span className={strong}>{formatINR(need)}</span> in {year} ({formatINR(goal.targetToday)}{" "}
            today).{" "}
            {r.onTrack ? (
              <>
                That leaves <span className="num font-medium text-pos">{formatINR(r.gap)} to spare</span>
                {reachedEarly && r.goalReachedMonth !== null ? (
                  <>
                    ; you cross the line in about <span className={strong}>{formatYears(r.goalReachedMonth / 12)}</span>
                  </>
                ) : null}
                .
              </>
            ) : (
              <>
                You'd be <span className="num font-medium text-cau">{formatINR(gapAbs)} short</span>;{" "}
                <span className={strong}>{formatINR(r.requiredSip)}/mo</span> closes it.
              </>
            )}
          </span>
        </li>
      </ol>

      {!r.onTrack &&
        (canFix ? (
          <button
            type="button"
            onClick={() => actions.setGoalAmount(goal.id, Math.ceil(r.requiredSip))}
            className="inline-flex h-9 w-fit items-center rounded-full bg-accent-fill px-3.5 text-support font-medium text-on-accent transition hover:bg-accent-fill-hi"
          >
            Put {formatINR(r.requiredSip)}/mo on this
          </button>
        ) : (
          <button
            type="button"
            onClick={() => actions.setTab("money")}
            className="w-fit text-support font-medium text-text underline underline-offset-2 transition hover:text-text-2"
          >
            That's more than you invest in total; raise your monthly on Money →
          </button>
        ))}

      <div>
        <button
          type="button"
          onClick={() => setShowWhy((v) => !v)}
          className="inline-flex items-center gap-1.5 text-caption text-text-2 transition hover:text-text"
        >
          {showWhy ? "Hide the workings" : "Why these numbers"}
          <span className={`inline-block transition-transform ${showWhy ? "rotate-180" : ""}`}>▾</span>
        </button>
        {showWhy && (
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
            {[
              { label: "Time left", value: formatYears(goal.horizonYears), hint: `Target year ${year}` },
              { label: "Pace assumed", value: `${formatPct(r.blendedReturn, 1)}/yr`, hint: "Your portfolio's historical pace" },
              { label: "Inflation", value: `${formatPct(inflation, 0)}/yr`, hint: "Why the goal costs more by the date" },
              {
                label: "Share of your monthly",
                value: `${Math.round(monthlyShare * 100)}%`,
                hint: `of ${formatINR(monthlyPool)} a month`,
              },
              ...(delayedSip !== null
                ? [{ label: "Start a year later", value: `${formatINR(delayedSip)}/mo`, hint: "The monthly needed if you wait a year" }]
                : []),
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
    </div>
  );
}
