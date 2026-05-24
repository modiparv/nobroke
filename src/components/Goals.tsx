import { useState } from "react";
import { GOALS } from "../lib/goals";
import { formatINR } from "../lib/format";
import { actions, useStore } from "../store";
import { btnPrimary, card, sectionLabel } from "../ui";
import AppHeader from "./AppHeader";
import GoalPlanner from "./GoalPlanner";

function PoolSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[13px] text-muted">{label}</span>
        <span className="text-sm font-semibold">{formatINR(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        className="w-full"
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ background: `linear-gradient(90deg,#1A1AFF ${pct}%,#E6DFD0 ${pct}%)`, borderRadius: 999, height: 6 }}
      />
    </div>
  );
}

export default function Goals() {
  const s = useStore();
  const [open, setOpen] = useState(false);
  const remaining = GOALS.filter((g) => !s.goals.some((x) => x.id === g.id));

  return (
    <div className="min-h-screen pb-24">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-5 py-8 sm:px-10">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Your goals</h1>
        <p className="mt-1 text-sm text-muted">
          Set when you need each goal, order them by priority, and split your monthly money. Your portfolio updates
          automatically.
        </p>

        {/* The monthly pool being split across goals */}
        <section className={`${card} mt-5`}>
          <span className={sectionLabel}>Your monthly pool</span>
          <div className="mt-3 grid gap-5 sm:grid-cols-2">
            <PoolSlider label="Total monthly investment" value={s.monthlySip} min={0} max={500000} step={1000} onChange={actions.setSip} />
            <PoolSlider label="Total current savings" value={s.currentSavings} min={0} max={20000000} step={25000} onChange={actions.setSavings} />
          </div>
        </section>

        <div className="mt-5">
          <GoalPlanner />
        </div>

        {/* Add a goal */}
        <div className="relative mt-4">
          <button
            onClick={() => setOpen((o) => !o)}
            className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-line px-4 py-2 text-sm font-medium text-muted transition hover:border-brand hover:text-ink"
          >
            ＋ Add a goal
          </button>
          {open && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
              <div className="absolute left-0 top-[calc(100%+8px)] z-20 flex max-h-72 w-60 flex-col gap-0.5 overflow-y-auto rounded-2xl border border-line bg-white p-2 shadow-xl">
                {remaining.length === 0 && <span className="p-3 text-center text-sm text-muted">All goals added 🎉</span>}
                {remaining.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => {
                      actions.addGoal(g.id);
                      setOpen(false);
                    }}
                    className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium hover:bg-paper"
                  >
                    <span>{g.emoji}</span>
                    {g.name}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="mt-8 flex justify-center">
          <button className={btnPrimary} onClick={actions.goPortfolio}>
            View portfolio →
          </button>
        </div>
      </main>
    </div>
  );
}
