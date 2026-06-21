import type { PlanResult } from "../lib/types";
import { formatINR, formatYears } from "../lib/format";
import { C } from "../lib/theme";

const W = 720;
const H = 250;
const PAD = { t: 18, r: 16, b: 30, l: 58 };
const PW = W - PAD.l - PAD.r;
const PH = H - PAD.t - PAD.b;

export default function Chart({ r }: { r: PlanResult }) {
  const maxX = Math.max(1, r.months);

  // Scale the chart to your money's own path so the curve is always clearly
  // visible. If the goal sits far above the projection, don't squash the curve
  // into a flat line at the bottom — annotate the goal at the top instead.
  const peak = Math.max(r.projectedCorpus, r.totalInvested, 1);
  const goalInView = r.requiredCorpus <= peak * 1.6;
  const maxY = (goalInView ? Math.max(peak, r.requiredCorpus) : peak) * 1.18;

  const x = (m: number) => PAD.l + (m / maxX) * PW;
  const y = (v: number) => PAD.t + PH - (Math.min(Math.max(v, 0), maxY) / maxY) * PH;

  const pts = r.series;
  const valuePath = pts.map((p, i) => `${i ? "L" : "M"}${x(p.month).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const investedPath = pts.map((p, i) => `${i ? "L" : "M"}${x(p.month).toFixed(1)},${y(p.invested).toFixed(1)}`).join(" ");
  const baseline = (PAD.t + PH).toFixed(1);
  const area = `${valuePath} L${x(maxX).toFixed(1)},${baseline} L${x(0).toFixed(1)},${baseline} Z`;

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maxY);
  const tickCount = Math.min(6, Math.max(2, Math.round(maxX / 12)));
  const xTicks = Array.from({ length: tickCount + 1 }, (_, i) => Math.round((maxX / tickCount) * i));
  const mono = "'Geist Mono', ui-monospace, monospace";
  const ty = y(r.requiredCorpus);

  return (
    <div className="mt-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="How your money grows over time">
        <defs>
          <linearGradient id="g-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.brand} stopOpacity="0.18" />
            <stop offset="100%" stopColor={C.brand} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {yTicks.map((v, i) => (
          <g key={i}>
            <line x1={PAD.l} y1={y(v)} x2={PAD.l + PW} y2={y(v)} stroke={C.line} strokeWidth="1" />
            <text x={PAD.l - 10} y={y(v) + 4} textAnchor="end" fontSize="11" fill={C.muted} fontFamily={mono}>
              {formatINR(v)}
            </text>
          </g>
        ))}
        {xTicks.map((m, i) => (
          <text key={i} x={x(m)} y={PAD.t + PH + 20} textAnchor="middle" fontSize="11" fill={C.muted} fontFamily={mono}>
            {formatYears(m / 12)}
          </text>
        ))}

        <path d={area} fill="url(#g-area)" />
        <path d={investedPath} fill="none" stroke={C.invested} strokeWidth="2" strokeDasharray="4 4" />
        <path d={valuePath} fill="none" stroke={C.brand} strokeWidth="2.8" strokeLinejoin="round" strokeLinecap="round" />

        {goalInView ? (
          <>
            <line x1={PAD.l} y1={ty} x2={PAD.l + PW} y2={ty} stroke={C.ink} strokeWidth="1.3" strokeDasharray="2 4" />
            <text x={PAD.l + PW} y={ty - 7} textAnchor="end" fontSize="11" fontWeight="600" fill={C.ink}>
              Goal {formatINR(r.requiredCorpus)}
            </text>
          </>
        ) : (
          <text x={PAD.l + PW} y={PAD.t + 11} textAnchor="end" fontSize="11" fontWeight="600" fill={C.ink}>
            ↑ Goal {formatINR(r.requiredCorpus)} (far above)
          </text>
        )}

        {/* Today and the finish line */}
        <circle cx={x(0)} cy={y(pts[0]?.value ?? 0)} r="3.5" fill={C.brand} />
        <circle cx={x(maxX)} cy={y(r.projectedCorpus)} r="5" fill={r.onTrack ? C.positive : C.brand} />
        <text x={x(maxX) - 8} y={y(r.projectedCorpus) - 9} textAnchor="end" fontSize="11" fontWeight="700" fill={C.ink}>
          {formatINR(r.projectedCorpus)}
        </text>
      </svg>

      <div className="mt-2 flex flex-wrap gap-4 font-mono text-[11px] uppercase tracking-wide text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-1 w-3.5 rounded" style={{ background: C.brand }} /> Your money
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-1 w-3.5 rounded" style={{ background: C.invested }} /> What you put in
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-1 w-3.5 rounded bg-ink" /> Goal
        </span>
      </div>
    </div>
  );
}
