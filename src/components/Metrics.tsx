import { useState } from "react";
import type { PlanGoal, PlanResult } from "../lib/types";
import { requiredSip } from "../lib/finance";
import { formatINR, formatPct, formatYears } from "../lib/format";

const THIS_YEAR = new Date().getFullYear();

/**
 * The goal brief, at a glance: one short verdict line, then six bare
 * figures a wealth manager gets asked for — what it costs by the date,
 * time left, what is set aside, what goes in monthly, the pace assumed,
 * the cost of waiting a year. No sentences under the numbers: the
 * explanations sit in tooltips for whoever hovers. Technical numbers
 * behind a tap.
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

interface Figure {
  label: string;
  value: string;
  hint: string;
}

function Figures({ items }: { items: Figure[] }) {
  return (
    <dl className="grid grid-cols-3 gap-x-4 gap-y-3">
      {items.map((f) => (
        <div key={f.label} className="min-w-0" title={f.hint}>
          <dt className="truncate text-eyebrow uppercase text-text-3">{f.label}</dt>
          <dd className="num mt-0.5 truncate text-row font-medium text-text">{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function Metrics({ r, goal, inflation, saved, monthly, monthlyShare, monthlyPool }: Props) {
  const [showNumbers, setShowNumbers] = useState(false);
  const year = THIS_YEAR + goal.horizonYears;
  // The cost of waiting: same target, same date, one year less of investing.
  const delayedSip =
    goal.horizonYears > 1 ? requiredSip(r.requiredCorpus, saved, r.blendedReturn, goal.horizonYears - 1) : null;
  const reachedEarly = r.onTrack && r.goalReachedMonth !== null && r.goalReachedMonth < r.months;
  const savedShare = goal.targetToday > 0 ? Math.round((saved / goal.targetToday) * 100) : 0;

  const facts: Figure[] = [
    {
      label: `Costs by ${year}`,
      value: formatINR(r.requiredCorpus),
      hint: `${formatINR(goal.targetToday)} today, at ${formatPct(inflation, 0)} inflation a year`,
    },
    { label: "Time left", value: formatYears(goal.horizonYears), hint: `Target year ${year}` },
    { label: "Set aside", value: formatINR(saved), hint: `${savedShare}% of today's price` },
    {
      label: "Monthly",
      value: `${formatINR(monthly)}/mo`,
      hint: `${Math.round(monthlyShare * 100)}% of your ${formatINR(monthlyPool)} a month`,
    },
    { label: "Pace", value: `${formatPct(r.blendedReturn, 1)}/yr`, hint: "Your portfolio's historical pace" },
    delayedSip !== null
      ? {
          label: "Wait a year",
          value: `${formatINR(delayedSip)}/mo`,
          hint: `Monthly needed if you start a year later, against ${formatINR(r.requiredSip)}/mo now`,
        }
      : { label: "Needed", value: `${formatINR(r.requiredSip)}/mo`, hint: "Monthly needed to reach it by the date" },
  ];

  const technical: Figure[] = [
    { label: "Growth / yr", value: formatPct(r.blendedReturn), hint: "A rough yearly average across your portfolio" },
    { label: "XIRR", value: formatPct(r.xirr), hint: "Your true return after the timing of each deposit" },
    { label: "Volatility", value: formatPct(r.blendedVolatility, 0), hint: "Higher means bigger ups and downs along the way" },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* The verdict, in a breath. */}
      <p className="num text-support text-text" title={`About ${formatINR(r.projectedCorpus)} by ${year}, against ${formatINR(r.requiredCorpus)} needed`}>
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

      <Figures items={facts} />

      <div>
        <button
          onClick={() => setShowNumbers((v) => !v)}
          className="inline-flex items-center gap-1.5 text-caption text-text-2 transition hover:text-text"
        >
          {showNumbers ? "Hide technical numbers" : "Technical numbers"}
          <span className={`inline-block transition-transform ${showNumbers ? "rotate-180" : ""}`}>▾</span>
        </button>
        {showNumbers && (
          <div className="mt-3">
            <Figures items={technical} />
          </div>
        )}
      </div>
    </div>
  );
}
