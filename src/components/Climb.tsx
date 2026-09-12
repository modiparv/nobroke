import { STAGES, routeHeight, stageFor } from "../lib/climb";
import { formatINR } from "../lib/format";
import { appetiteCeiling } from "../lib/risk";
import { actions, monthlyForCoverage, planCoverage, useStore } from "../store";

/**
 * The avatar: a climber on Meru, the golden mountain. Height is how much of
 * the whole plan today's pace covers; the route's shape follows risk
 * appetite (steady rises early, bold runs flat then steep); five named
 * stages mark the way; the flag waits at the summit. The one nudge under
 * it is computed, not motivational filler: the smallest extra monthly that
 * reaches the next stage, applied in a tap.
 */
const W = 320;
const H = 96;
const PAD = 10;
const SKY = 16;

export default function Climb() {
  const s = useStore();
  if (s.goals.length === 0) return null;
  const coverage = planCoverage(s);
  const { stage, index, next } = stageFor(coverage);
  const appetite = appetiteCeiling(s.riskAppetite);
  const pt = (t: number) => ({
    x: PAD + t * (W - 2 * PAD),
    y: H - PAD - routeHeight(t, appetite) * (H - 2 * PAD - SKY),
  });
  const path = Array.from({ length: 33 }, (_, i) => pt(i / 32))
    .map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");
  const me = pt(Math.min(coverage, 1));
  const top = pt(1);
  const extra = next ? monthlyForCoverage(s, next.min) : null;
  const pctText = `${Math.round(coverage * 100)}% covered`;

  return (
    <div className="mt-5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-eyebrow uppercase text-on-night-2">Your climb</span>
        <span className="num text-caption text-on-night-2">{pctText} at today's pace</span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-1.5 w-full"
        role="img"
        aria-label={`Your climb: ${stage.name}, ${pctText} at today's pace`}
      >
        <path d={path} fill="none" stroke="rgb(var(--on-night-3))" strokeWidth="1.5" strokeLinejoin="round" />
        {STAGES.map((st, i) => {
          const p = pt(st.min);
          return (
            <circle
              key={st.name}
              cx={p.x}
              cy={p.y}
              r={i <= index ? 2.6 : 2}
              fill={i <= index ? "rgb(var(--on-night))" : "rgb(var(--night))"}
              stroke="rgb(var(--on-night-3))"
              strokeWidth="1"
            />
          );
        })}
        {/* The flag at the summit. */}
        <line x1={top.x} y1={top.y} x2={top.x} y2={top.y - 15} stroke="rgb(var(--on-night-2))" strokeWidth="1.2" />
        <path d={`M${top.x},${top.y - 15} l9,3.5 l-9,3.5 z`} fill="var(--chartn-3)" />
        {/* The climber, feet on the path. */}
        <g transform={`translate(${me.x.toFixed(1)},${(me.y - 4).toFixed(1)})`}>
          <circle cx="0" cy="-11" r="3.2" fill="var(--chartn-1)" />
          <path
            d="M0,-8 L0,-1 M0,-6 L-4,-3 M0,-6 L4,-4 M0,-1 L-3,4 M0,-1 L3,4"
            fill="none"
            stroke="var(--chartn-1)"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </g>
      </svg>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="text-support text-on-night">
          <span className="font-medium">{stage.name}</span>
          <span className="mx-1.5 text-on-night-3">·</span>
          <span className="text-on-night-2">{stage.line}</span>
        </span>
        {next && extra !== null && (
          <button
            type="button"
            onClick={() => actions.setSip(s.monthlySip + extra)}
            className="num inline-flex h-7 items-center rounded-full border border-on-night-3/60 px-2.5 text-caption text-on-night transition hover:border-on-night-2"
          >
            Add {formatINR(extra)}/mo → {next.name}
          </button>
        )}
      </div>
    </div>
  );
}
