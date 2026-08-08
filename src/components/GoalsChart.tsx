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

// Series colours resolve through theme tokens so the chart reads correctly
// on both the paper and the near-black surface.
const PALETTE = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)"];

const W = 640;
const H = 300;
const M = { top: 14, right: 18, bottom: 26, left: 62 };

export default function GoalsChart() {
  const s = useStore();
  const goals = goalsByPriority(s);
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

  return (
    <section className="rounded-card border border-line bg-surface p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-3">
        <span className={sectionLabel}>Goal trajectories</span>
        <span className="text-caption text-text-2">At today's pace</span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full" role="img" aria-label="Projected path of every goal">
        {/* Grid and value labels */}
        {valueTicks.map((v) => (
          <g key={v}>
            <line x1={M.left} x2={W - M.right} y1={y(v)} y2={y(v)} stroke="rgb(var(--line))" strokeWidth="1" />
            <text x={M.left - 8} y={y(v) + 3} textAnchor="end" fontSize="10" fill="rgb(var(--text-3))" className="num">
              {formatINR(v)}
            </text>
          </g>
        ))}
        <line x1={M.left} x2={W - M.right} y1={y(0)} y2={y(0)} stroke="rgb(var(--line-2))" strokeWidth="1" />
        {yearTicks.map((t) => (
          <text key={t} x={x(t)} y={H - 8} textAnchor="middle" fontSize="10" fill="rgb(var(--text-3))" className="num">
            {baseYear + t}
          </text>
        ))}

        {/* One line per goal, its need marked hollow at its date */}
        {series.map((sr, i) => {
          const color = PALETTE[i % PALETTE.length];
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
                fill="rgb(var(--surface))"
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
            <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
            <span className="text-support text-text">{sr.goal.name}</span>
            <span className={`rounded-full px-1.5 py-px text-index uppercase tracking-wide ${sr.onTrack ? "bg-pos-bg text-pos" : "bg-cau-bg text-cau"}`}>
              {sr.onTrack ? "On track" : "Short"}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-caption text-text-2">
        Lines follow each goal's share of your money at the mix's historical pace. Hollow circles mark what each goal
        needs by its date.
      </p>
    </section>
  );
}
