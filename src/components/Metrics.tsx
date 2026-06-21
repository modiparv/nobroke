import { useState } from "react";
import type { PlanGoal, PlanResult } from "../lib/types";
import { formatINR, formatPct } from "../lib/format";
import { C } from "../lib/theme";

const THIS_YEAR = new Date().getFullYear();

function Ring({ progress, onTrack }: { progress: number; onTrack: boolean }) {
  const pct = Math.max(0, Math.min(1, progress));
  const radius = 30;
  const c = 2 * Math.PI * radius;
  const color = onTrack ? C.positive : C.ink;
  return (
    <svg viewBox="0 0 72 72" className="h-[72px] w-[72px] flex-none">
      <circle cx="36" cy="36" r={radius} fill="none" stroke={C.track} strokeWidth="7" />
      <circle
        cx="36"
        cy="36"
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={`${(c * pct).toFixed(1)} ${(c * (1 - pct)).toFixed(1)}`}
        transform="rotate(-90 36 36)"
      />
      <text x="36" y="41" textAnchor="middle" fontSize="15" fontWeight="700" fill={C.ink}>
        {Math.round(pct * 100)}%
      </text>
    </svg>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: "good" | "bad" }) {
  const color = accent === "good" ? "text-positive" : "text-ink";
  return (
    <div className="rounded-xl border border-line bg-paper p-3">
      <div className="text-[11px] font-medium text-muted">{label}</div>
      <div className={`text-lg font-semibold ${color}`}>{value}</div>
      <div className="text-[11px] leading-snug text-muted">{sub}</div>
    </div>
  );
}

export default function Metrics({ r, goal, inflation }: { r: PlanResult; goal: PlanGoal; inflation: number }) {
  const [showNumbers, setShowNumbers] = useState(false);
  const year = THIS_YEAR + goal.horizonYears;
  const growth = Math.max(0, r.projectedCorpus - r.totalInvested);

  return (
    <div className="flex flex-col gap-4">
      {/* The plain-English answer first */}
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-line bg-paper p-4">
        <div className="min-w-0">
          <div className="text-[11px] font-medium text-muted">Will you reach {goal.name}?</div>
          <div className="mt-0.5 text-2xl font-bold tracking-tight sm:text-3xl">
            {r.onTrack ? "Yes, you're on track 🎉" : "Almost there, just a little short"}
          </div>
          <div className="mt-1 text-[12.5px] leading-snug text-muted">
            By <span className="font-semibold text-ink">{year}</span> you'll have about{" "}
            <span className="font-semibold text-ink">{formatINR(r.projectedCorpus)}</span>. Your goal needs{" "}
            <span className="font-semibold text-ink">{formatINR(r.requiredCorpus)}</span>.
          </div>
        </div>
        <Ring progress={r.progress} onTrack={r.onTrack} />
      </div>

      {/* The three numbers that actually matter, in plain words */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <Stat
          label="What it'll cost by then"
          value={formatINR(r.requiredCorpus)}
          sub={`It's ${formatINR(goal.targetToday)} today. Prices slowly rise (about ${formatPct(inflation, 0)} a year), so you'll need more by then.`}
        />
        <Stat
          label={r.onTrack ? "Extra cushion" : "You'll be short by"}
          value={formatINR(Math.abs(r.gap))}
          sub={r.onTrack ? "More than enough to hit the goal 🎉" : `Add about ${formatINR(r.requiredSip)}/mo to get there.`}
          accent={r.onTrack ? "good" : "bad"}
        />
        <Stat
          label="Money you'll put in"
          value={formatINR(r.totalInvested)}
          sub={`The other ${formatINR(growth)} is growth on top: your money earning more money.`}
        />
      </div>

      {/* The technical numbers, hidden by default so they don't intimidate */}
      <div>
        <button
          onClick={() => setShowNumbers((v) => !v)}
          className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-muted transition hover:text-ink"
        >
          {showNumbers ? "Hide the technical numbers" : "Show the technical numbers"}
          <span className={`inline-block transition-transform ${showNumbers ? "rotate-180" : ""}`}>▾</span>
        </button>
        {showNumbers && (
          <div className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <Stat label="Growth each year (estimate)" value={formatPct(r.blendedReturn)} sub="A rough yearly average across your mix." />
            <Stat label="Real return (XIRR)" value={formatPct(r.xirr)} sub="Your true return after the timing of each deposit." />
            <Stat label="How bumpy the ride" value={formatPct(r.blendedVolatility, 0)} sub="Higher means bigger ups and downs along the way." />
          </div>
        )}
      </div>
    </div>
  );
}
