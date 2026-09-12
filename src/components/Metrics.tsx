import { useState } from "react";
import type { PlanGoal, PlanResult } from "../lib/types";
import { requiredSip } from "../lib/finance";
import { formatINR, formatPct, formatYears } from "../lib/format";
import { sectionLabel } from "../ui";

const THIS_YEAR = new Date().getFullYear();

/**
 * The goal brief, the way a wealth manager gives it across the table: the
 * verdict first in one sentence, then the six facts they would be asked
 * for — what it will cost by the date, how long is left, what is already
 * set aside, what goes in each month, the pace assumed, and what waiting
 * a year would cost — then the technical numbers behind a tap.
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

function Fact({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2 px-3 py-2.5">
      <div className="text-eyebrow uppercase text-text-3">{label}</div>
      <div className="num mt-0.5 text-row font-medium text-text">{value}</div>
      <div className="mt-0.5 text-caption leading-snug text-text-2">{sub}</div>
    </div>
  );
}

export default function Metrics({ r, goal, inflation, saved, monthly, monthlyShare, monthlyPool }: Props) {
  const [showNumbers, setShowNumbers] = useState(false);
  const year = THIS_YEAR + goal.horizonYears;
  const extra = Math.max(0, r.requiredSip - monthly);
  // The cost of waiting: same target, same date, one year less of investing.
  const delayedSip =
    goal.horizonYears > 1 ? requiredSip(r.requiredCorpus, saved, r.blendedReturn, goal.horizonYears - 1) : null;
  const reachedEarly = r.onTrack && r.goalReachedMonth !== null && r.goalReachedMonth < r.months;
  const savedShare = goal.targetToday > 0 ? Math.round((saved / goal.targetToday) * 100) : 0;

  return (
    <div className="flex flex-col gap-4">
      {/* The verdict, in one sentence. */}
      <p className="text-support leading-relaxed text-text">
        By <span className="num font-medium">{year}</span> this reaches about{" "}
        <span className="num font-medium">{formatINR(r.projectedCorpus)}</span> against{" "}
        <span className="num font-medium">{formatINR(r.requiredCorpus)}</span> needed:{" "}
        {r.onTrack ? (
          <>
            on track, with <span className="num font-medium text-pos">{formatINR(r.gap)}</span> to spare
            {reachedEarly && r.goalReachedMonth !== null ? (
              <>
                , and at this pace you cross the line in about{" "}
                <span className="num font-medium">{formatYears(r.goalReachedMonth / 12)}</span>
              </>
            ) : null}
            .
          </>
        ) : (
          <>
            short by <span className="num font-medium text-cau">{formatINR(Math.abs(r.gap))}</span>. About{" "}
            <span className="num font-medium">{formatINR(r.requiredSip)}</span> a month gets there
            {extra > 0 ? <> (+{formatINR(extra)} on today's monthly)</> : null}.
          </>
        )}
      </p>

      <div>
        <span className={sectionLabel}>The goal at a glance</span>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Fact
            label={`Costs by ${year}`}
            value={formatINR(r.requiredCorpus)}
            sub={`${formatINR(goal.targetToday)} today, at ${formatPct(inflation, 0)} inflation a year`}
          />
          <Fact label="Time left" value={formatYears(goal.horizonYears)} sub={`Target year ${year}`} />
          <Fact label="Set aside now" value={formatINR(saved)} sub={`${savedShare}% of today's price`} />
          <Fact
            label="Going in monthly"
            value={`${formatINR(monthly)}/mo`}
            sub={`${Math.round(monthlyShare * 100)}% of your ${formatINR(monthlyPool)} a month`}
          />
          <Fact label="Pace assumed" value={`${formatPct(r.blendedReturn, 1)} a year`} sub="Your portfolio's historical pace" />
          {delayedSip !== null ? (
            <Fact
              label="If you wait a year"
              value={`${formatINR(delayedSip)}/mo`}
              sub={`against ${formatINR(r.requiredSip)}/mo starting now`}
            />
          ) : (
            <Fact label="Needed monthly" value={`${formatINR(r.requiredSip)}/mo`} sub="To reach it by the date" />
          )}
        </div>
      </div>

      {/* The technical numbers, behind a tap so they never intimidate. */}
      <div>
        <button
          onClick={() => setShowNumbers((v) => !v)}
          className="inline-flex items-center gap-1.5 text-caption uppercase tracking-wide text-muted transition hover:text-ink"
        >
          {showNumbers ? "Hide the technical numbers" : "Show the technical numbers"}
          <span className={`inline-block transition-transform ${showNumbers ? "rotate-180" : ""}`}>▾</span>
        </button>
        {showNumbers && (
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Fact label="Growth each year (estimate)" value={formatPct(r.blendedReturn)} sub="A rough yearly average across your portfolio." />
            <Fact label="Real return (XIRR)" value={formatPct(r.xirr)} sub="Your true return after the timing of each deposit." />
            <Fact label="Volatility" value={formatPct(r.blendedVolatility, 0)} sub="Higher means bigger ups and downs along the way." />
          </div>
        )}
      </div>
    </div>
  );
}
