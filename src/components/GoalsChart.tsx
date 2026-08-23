import { blendedReturn, computePlan, projectionSeries, requiredCorpus } from "../lib/finance";
import { formatINR } from "../lib/format";
import { goalsByPriority, planInputsForGoal, useStore } from "../store";
import { sectionLabel } from "../ui";

/**
 * Every goal's trajectory on one chart, computed with exactly the same
 * inputs the Plan tab uses (each goal's share of capital and of the monthly
 * amount, growing at the shared mix's blended return). Solid lines are the
 * current pace; the hollow circle on each line marks what that goal needs by
 * its date, so the gap between line-end and circle IS the story.
 */

// Two palettes for two grounds: paper cards and the night band.
const PALETTE = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)"];
const NIGHT_PALETTE = ["var(--chartn-1)", "var(--chartn-2)", "var(--chartn-3)", "var(--chartn-4)", "var(--chartn-5)", "var(--chartn-6)"];

const W = 640;
const M = { top: 14, right: 18, bottom: 26, left: 62 };

export default function GoalsChart({ variant = "card" }: { variant?: "card" | "night" }) {
  const s = useStore();
  const goals = goalsByPriority(s);
  const night = variant === "night";
  const H = night ? 200 : 300;
  const palette = night ? NIGHT_PALETTE : PALETTE;
  const tone = night
    ? {
        grid: "rgb(var(--on-night-3) / 0.35)",
        base: "rgb(var(--on-night-3))",
        tick: "rgb(var(--on-night-3))",
        hollow: "rgb(var(--night))",
        eyebrow: "text-eyebrow uppercase text-on-night-3",
        aside: "text-caption text-on-night-2",
        name: "text-support text-on-night",
        caption: "text-caption text-on-night-3",
      }
    : {
        grid: "rgb(var(--line))",
        base: "rgb(var(--line-2))",
        tick: "rgb(var(--text-3))",
        hollow: "rgb(var(--surface))",
        eyebrow: sectionLabel,
        aside: "text-caption text-text-2",
        name: "text-support text-text",
        caption: "text-caption text-text-2",
      };
  if (goals.length === 0) return null;

  const ret = blendedReturn(s.portfolio);
  const series = goals.map((g) => {
    const inputs = planInputsForGoal(s, g);
    return {
      goal: g,
      points: projectionSeries(inputs, ret),
      need: requiredCorpus(g.targetToday, s.inflation, g.horizonYears),
      onTrack: computePlan(inputs).onTrack,
    };
  });

  const maxYears = Math.max(5, ...goals.map((g) => g.horizonYears));
  const maxValue = Math.max(...series.flatMap((sr) => [sr.need, sr.points[sr.points.length - 1]?.value ?? 0])) * 1.06 || 1;

  const x = (year: number) => M.left + (year / maxYears) * (W - M.left - M.right);
  const y = (v: number) => H - M.bottom - (v / maxValue) * (H - M.top - M.bottom);

  const yearStep = Math.max(1, Math.ceil(maxYears / 6));
  const yearTicks: number[] = [];
  for (let t = 0; t <= maxYears; t += yearStep) yearTicks.push(t);
  const valueTicks = [0.25, 0.5, 0.75, 1].map((f) => maxValue * f);
  const baseYear = new Date().getFullYear();

  const Wrapper = night ? "div" : "section";
  return (
    <Wrapper className={night ? "" : "rounded-card border border-line bg-surface p-4 sm:p-5"}>
      <div className="flex items-baseline justify-between gap-3">
        <span className={tone.eyebrow}>Goal trajectories</span>
        <span className={tone.aside}>At today's pace</span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full" role="img" aria-label="Projected path of every goal">
        {/* Grid and value labels */}
        {valueTicks.map((v) => (
          <g key={v}>
            <line x1={M.left} x2={W - M.right} y1={y(v)} y2={y(v)} stroke={tone.grid} strokeWidth="1" />
            <text x={M.left - 8} y={y(v) + 3} textAnchor="end" fontSize="10" fill={tone.tick} className="num">
              {formatINR(v)}
            </text>
          </g>
        ))}
        <line x1={M.left} x2={W - M.right} y1={y(0)} y2={y(0)} stroke={tone.base} strokeWidth="1" />
        {yearTicks.map((t) => (
          <text key={t} x={x(t)} y={H - 8} textAnchor="middle" fontSize="10" fill={tone.tick} className="num">
            {baseYear + t}
          </text>
        ))}

        {/* One line per goal, its need marked hollow at its date */}
        {series.map((sr, i) => {
          const color = palette[i % palette.length];
          const d = sr.points
            .map((p, j) => `${j ? "L" : "M"}${x(p.year).toFixed(1)},${y(Math.min(p.value, maxValue)).toFixed(1)}`)
            .join(" ");
          return (
            <g key={sr.goal.id}>
              <title>
                {sr.goal.name}: about {formatINR(sr.points[sr.points.length - 1]?.value ?? 0)} by{" "}
                {baseYear + sr.goal.horizonYears}; needs {formatINR(sr.need)}
              </title>
              <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              <circle
                cx={x(sr.goal.horizonYears)}
                cy={y(Math.min(sr.need, maxValue))}
                r="4.5"
                fill={tone.hollow}
                stroke={color}
                strokeWidth="2"
              />
            </g>
          );
        })}
      </svg>

      {/* Legend: the goals, with the same numbers the Plan tab shows */}
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
        {series.map((sr, i) => (
          <li key={sr.goal.id} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: palette[i % palette.length] }} />
            <span className={tone.name}>{sr.goal.name}</span>
            <span className={`rounded-full px-1.5 py-px text-index uppercase tracking-wide ${sr.onTrack ? "bg-pos-bg text-pos" : "bg-cau-bg text-cau"}`}>
              {sr.onTrack ? "On track" : "Short"}
            </span>
          </li>
        ))}
      </ul>
      <p className={`mt-2 ${tone.caption}`}>
        Lines follow each goal's share of your money at the mix's historical pace. Hollow circles mark what each goal
        needs by its date.
      </p>
    </Wrapper>
  );
}
