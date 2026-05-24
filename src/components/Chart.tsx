import type { PlanResult } from "../lib/types";
import { formatINR, formatYears } from "../lib/format";

const W = 720;
const H = 280;
const PAD = { t: 20, r: 18, b: 34, l: 56 };
const PW = W - PAD.l - PAD.r;
const PH = H - PAD.t - PAD.b;

export default function Chart({ r }: { r: PlanResult }) {
  const maxX = Math.max(1, r.months);
  const maxY = Math.max(1, Math.max(r.projectedCorpus, r.requiredCorpus) * 1.12);
  const x = (m: number) => PAD.l + (m / maxX) * PW;
  const y = (v: number) => PAD.t + PH - (v / maxY) * PH;

  const line = (key: "value" | "invested") =>
    r.series.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.month).toFixed(1)},${y(p[key]).toFixed(1)}`).join(" ");
  const valuePath = line("value");
  const investedPath = line("invested");
  const area = `${valuePath} L${x(maxX).toFixed(1)},${(PAD.t + PH).toFixed(1)} L${x(0).toFixed(1)},${(PAD.t + PH).toFixed(1)} Z`;

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maxY);
  const tickCount = Math.min(7, Math.max(2, Math.round(maxX / 12)));
  const xTicks = Array.from({ length: tickCount + 1 }, (_, i) => Math.round((maxX / tickCount) * i));
  const ty = y(r.requiredCorpus);

  return (
    <div className="mt-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Projected growth">
        <defs>
          <linearGradient id="g-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2CC295" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#2CC295" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {yTicks.map((v, i) => (
          <g key={i}>
            <line x1={PAD.l} y1={y(v)} x2={PAD.l + PW} y2={y(v)} stroke="#EEF2F1" strokeWidth="1" />
            <text x={PAD.l - 10} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#9aa5a1">
              {formatINR(v)}
            </text>
          </g>
        ))}
        {xTicks.map((m, i) => (
          <text key={i} x={x(m)} y={PAD.t + PH + 22} textAnchor="middle" fontSize="11" fill="#9aa5a1">
            {formatYears(m / 12)}
          </text>
        ))}
        <path d={area} fill="url(#g-area)" />
        <path d={investedPath} fill="none" stroke="#BFD8CF" strokeWidth="1.6" strokeDasharray="4 4" />
        <path d={valuePath} fill="none" stroke="#03654C" strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />
        <line x1={PAD.l} y1={ty} x2={PAD.l + PW} y2={ty} stroke="#04130F" strokeWidth="1.3" strokeDasharray="2 4" />
        <text x={PAD.l + PW} y={ty - 8} textAnchor="end" fontSize="11" fontWeight="500" fill="#04130F">
          Target {formatINR(r.requiredCorpus)}
        </text>
        <circle cx={x(maxX)} cy={y(r.projectedCorpus)} r="5" fill={r.onTrack ? "#03654C" : "#B45309"} />
      </svg>
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-1 w-3.5 rounded bg-brand-deep" /> Projected value
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-1 w-3.5 rounded" style={{ background: "#BFD8CF" }} /> Amount invested
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-1 w-3.5 rounded bg-ink" /> Inflation-adjusted target
        </span>
      </div>
    </div>
  );
}
