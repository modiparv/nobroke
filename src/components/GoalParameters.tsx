import { formatINR, formatYears } from "../lib/format";
import type { PlanGoal } from "../lib/types";
import { actions, useStore } from "../store";

interface Row {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  display: string;
  onChange: (v: number) => void;
}

function Slider({ row }: { row: Row }) {
  const pct = ((row.value - row.min) / (row.max - row.min)) * 100;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[13px] text-muted">{row.label}</span>
        <span className="text-sm font-medium">{row.display}</span>
      </div>
      <input
        type="range"
        min={row.min}
        max={row.max}
        step={row.step}
        value={row.value}
        aria-label={row.label}
        className="w-full"
        onChange={(e) => row.onChange(Number(e.target.value))}
        style={{ background: `linear-gradient(90deg,#FFCC00 ${pct}%,#ECE0C4 ${pct}%)`, borderRadius: 999, height: 6 }}
      />
    </div>
  );
}

export default function GoalParameters({ goal }: { goal: PlanGoal }) {
  const s = useStore();
  const rows: Row[] = [
    {
      label: "Target amount (today's value)",
      min: 50000,
      max: 50000000,
      step: 50000,
      value: goal.targetToday,
      display: formatINR(goal.targetToday),
      onChange: (v) => actions.updateCurrentGoal({ targetToday: v }),
    },
    {
      label: "Time horizon",
      min: 1,
      max: 30,
      step: 1,
      value: goal.horizonYears,
      display: formatYears(goal.horizonYears),
      onChange: (v) => actions.updateCurrentGoal({ horizonYears: v }),
    },
    {
      label: "Monthly investment (SIP)",
      min: 0,
      max: 500000,
      step: 1000,
      value: s.monthlySip,
      display: formatINR(s.monthlySip) + "/mo",
      onChange: actions.setSip,
    },
    {
      label: "Current savings (lump sum)",
      min: 0,
      max: 20000000,
      step: 25000,
      value: s.currentSavings,
      display: formatINR(s.currentSavings),
      onChange: actions.setSavings,
    },
    {
      label: "Assumed inflation",
      min: 0,
      max: 12,
      step: 0.5,
      value: s.inflation * 100,
      display: (s.inflation * 100).toFixed(1) + "%",
      onChange: (v) => actions.setInflation(v / 100),
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      {rows.map((r) => (
        <Slider key={r.label} row={r} />
      ))}
    </div>
  );
}
