import { appetiteCeiling } from "../lib/risk";
import { formatINR } from "../lib/format";
import { totalCapital, useStore } from "../store";

/**
 * The climb: the plan's progress as an ascent, drawn in the band's own line
 * language. The marker's position is honest arithmetic (everything set
 * aside, over what every goal costs at today's prices); it passes named
 * stages on the way to the summit, the next one priced in rupees. Meru, the
 * golden mountain of the top tier, is the metaphor the brand already owns.
 * Risk appetite names the climber, never the route.
 */
const POINTS: Array<[number, number]> = [
  [0, 90],
  [40, 78],
  [70, 84],
  [110, 60],
  [140, 66],
  [180, 42],
  [210, 48],
  [250, 26],
  [280, 32],
  [320, 8],
];

const STAGES = [
  { at: 0, name: "Base camp" },
  { at: 0.1, name: "Foothills" },
  { at: 0.35, name: "The ridge" },
  { at: 0.65, name: "Cloud line" },
  { at: 0.9, name: "Summit" },
];

const CLIMBER = { steady: "Steady climber", balanced: "Balanced climber", bold: "Bold climber" } as const;

/** The point a given fraction of the way along the route, by arc length. */
function alongRoute(frac: number) {
  const lengths: number[] = [];
  let total = 0;
  for (let i = 1; i < POINTS.length; i++) {
    const [x0, y0] = POINTS[i - 1];
    const [x1, y1] = POINTS[i];
    const len = Math.hypot(x1 - x0, y1 - y0);
    lengths.push(len);
    total += len;
  }
  let remaining = frac * total;
  for (let i = 1; i < POINTS.length; i++) {
    const len = lengths[i - 1];
    if (remaining <= len || i === POINTS.length - 1) {
      const t = len > 0 ? Math.max(0, Math.min(1, remaining / len)) : 0;
      const [x0, y0] = POINTS[i - 1];
      const [x1, y1] = POINTS[i];
      return { x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, done: frac * total, total };
    }
    remaining -= len;
  }
  return { x: POINTS[0][0], y: POINTS[0][1], done: 0, total };
}

export default function Climb() {
  const s = useStore();
  if (s.goals.length === 0) return null;
  const targets = s.goals.reduce((sum, g) => sum + g.targetToday, 0);
  const saved = totalCapital(s);
  const frac = targets > 0 ? Math.max(0, Math.min(1, saved / targets)) : 0;
  const stage = [...STAGES].reverse().find((st) => frac >= st.at) ?? STAGES[0];
  const next = STAGES.find((st) => st.at > frac);
  const toNext = next ? Math.max(0, next.at * targets - saved) : 0;
  const { x, y, done, total } = alongRoute(frac);
  const route = POINTS.map(([px, py]) => `${px},${py}`).join(" ");
  const climber = CLIMBER[appetiteCeiling(s.riskAppetite)];

  return (
    <div className="mt-5 max-w-sm">
      <svg
        viewBox="0 0 320 100"
        className="w-full"
        role="img"
        aria-label={`Your climb: ${stage.name}, ${Math.round(frac * 100)}% of the way to funding every goal at today's prices`}
      >
        <polyline points={route} fill="none" stroke="rgb(var(--on-night-3))" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
        <polyline
          points={route}
          fill="none"
          stroke="rgb(var(--on-night))"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          strokeDasharray={`${done.toFixed(1)} ${total.toFixed(1)}`}
          className="transition-all duration-700 ease-out"
        />
        <circle cx={x} cy={y} r="8" fill="none" stroke="rgb(var(--on-night))" opacity="0.35" />
        <circle cx={x} cy={y} r="4" fill="rgb(var(--on-night))" />
        <circle cx="320" cy="8" r="2.5" fill="rgb(var(--on-night-3))" />
      </svg>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <span className="text-eyebrow uppercase text-on-night-2">
          The climb · {stage.name}
        </span>
        <span className="num text-caption text-on-night-2">
          {next ? `${formatINR(toNext)} to ${next.name.toLowerCase()}` : "Every goal funded at today's prices"}
          <span className="mx-1.5 text-on-night-3">·</span>
          {climber}
        </span>
      </div>
    </div>
  );
}
