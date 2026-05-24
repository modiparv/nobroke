import type { PlanGoal, PlanResult } from "../lib/types";
import { formatINR, formatPct, formatYears } from "../lib/format";

function Ring({ progress, onTrack }: { progress: number; onTrack: boolean }) {
  const pct = Math.max(0, Math.min(1, progress));
  const radius = 30;
  const c = 2 * Math.PI * radius;
  const color = onTrack ? "#03654C" : "#B45309";
  return (
    <svg viewBox="0 0 72 72" className="h-[72px] w-[72px] flex-none">
      <circle cx="36" cy="36" r={radius} fill="none" stroke="#EAF1EE" strokeWidth="7" />
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
      <text x="36" y="41" textAnchor="middle" fontSize="15" fontWeight="600" fill="#04130F">
        {Math.round(pct * 100)}%
      </text>
    </svg>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: "good" | "bad" }) {
  const color = accent === "good" ? "text-brand-deep" : accent === "bad" ? "text-[#B45309]" : "text-ink";
  return (
    <div className="rounded-xl border border-line bg-paper p-3">
      <div className="text-[11px] font-medium text-muted">{label}</div>
      <div className={`text-lg font-medium ${color}`}>{value}</div>
      <div className="text-[11px] text-muted">{sub}</div>
    </div>
  );
}

export default function Metrics({ r, goal, inflation }: { r: PlanResult; goal: PlanGoal; inflation: number }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-line bg-paper p-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-muted">Projected corpus at goal</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                r.onTrack ? "bg-brand-deep text-white" : "bg-[#B45309] text-white"
              }`}
            >
              {r.onTrack ? "On track" : "Catching up"}
            </span>
          </div>
          <div className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">{formatINR(r.projectedCorpus)}</div>
          <div className="text-[11px] text-muted">
            in {formatYears(goal.horizonYears)} · {formatINR(r.realProjectedCorpus)} in today's value
          </div>
        </div>
        <Ring progress={r.progress} onTrack={r.onTrack} />
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <Stat label="Target (inflation-adj.)" value={formatINR(r.requiredCorpus)} sub={`${formatINR(goal.targetToday)} today @ ${formatPct(inflation, 0)}`} />
        <Stat
          label={r.onTrack ? "Surplus over target" : "Shortfall vs target"}
          value={formatINR(Math.abs(r.gap))}
          sub={r.onTrack ? "you beat the goal" : `bridge with ${formatINR(r.requiredSip)}/mo`}
          accent={r.onTrack ? "good" : "bad"}
        />
        <Stat label="Expected return p.a." value={formatPct(r.blendedReturn)} sub="blended across funds" />
        <Stat label="Projected XIRR" value={formatPct(r.xirr)} sub="money-weighted" />
        <Stat label="Total invested" value={formatINR(r.totalInvested)} sub={`${formatINR(r.projectedCorpus - r.totalInvested)} is growth`} />
        <Stat label="Portfolio risk" value={formatPct(r.blendedVolatility, 0)} sub="annual volatility" />
      </div>
    </div>
  );
}
