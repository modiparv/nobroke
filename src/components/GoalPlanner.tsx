import { useState } from "react";
import { computePlan } from "../lib/finance";
import { formatINR, formatYears } from "../lib/format";
import { actions, currentGoal, goalMonthly, goalsByPriority, planInputsForGoal, useStore } from "../store";
import { card } from "../ui";

const BASE_YEAR = new Date().getFullYear();

export default function GoalPlanner() {
  const s = useStore();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  if (s.goals.length === 0) return null;
  const ordered = goalsByPriority(s);
  const current = currentGoal(s);
  const unconfirmed = s.goals.filter((g) => !g.tenureConfirmed).length;

  return (
    <section className={card}>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Goals &amp; money split</h2>
        <button
          onClick={actions.recommendGoalSplit}
          className="rounded-full border border-line px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide text-muted transition hover:border-brand hover:text-ink"
        >
          ✨ Recommend split
        </button>
      </div>
      <p className="text-[13px] text-muted">
        Splitting <span className="font-semibold text-ink">{formatINR(s.monthlySip)}/mo</span> across {s.goals.length}{" "}
        {s.goals.length === 1 ? "goal" : "goals"}. Drag <span aria-hidden>⠿</span> (or use ▲▼) to set priority.
      </p>

      {unconfirmed > 0 && (
        <p className="mt-3 rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink">
          Confirm the target year for {unconfirmed} {unconfirmed === 1 ? "goal" : "goals"} so we can build the full plan.
        </p>
      )}

      <ul className="mt-3 flex flex-col gap-2.5" aria-label="Goals by priority">
        {ordered.map((g, i) => {
          const r = computePlan(planInputsForGoal(s, g));
          const amount = goalMonthly(s, g.id);
          const sharePct = s.monthlySip > 0 ? Math.round((amount / s.monthlySip) * 100) : 0;
          const progress = Math.max(0, Math.min(1, r.progress));
          const isCurrent = current?.id === g.id;
          const isOver = overId === g.id && dragId !== g.id;
          const year = BASE_YEAR + g.horizonYears;
          return (
            <li
              key={g.id}
              onDragOver={(e) => {
                if (!dragId) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (overId !== g.id) setOverId(g.id);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragId && dragId !== g.id) actions.reorderGoals(dragId, g.id);
                setDragId(null);
                setOverId(null);
              }}
              className={`rounded-xl border p-3 transition ${
                isOver ? "border-brand ring-2 ring-brand/30" : isCurrent ? "border-ink" : "border-line"
              } ${dragId === g.id ? "opacity-50" : ""}`}
            >
              <div className="flex items-start gap-2.5">
                {/* Drag handle + keyboard reorder */}
                <div className="flex flex-none flex-col items-center pt-0.5">
                  <span
                    draggable
                    onDragStart={(e) => {
                      setDragId(g.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setOverId(null);
                    }}
                    role="button"
                    aria-label={`Drag to reorder ${g.name}`}
                    title="Drag to reorder"
                    className="cursor-grab select-none px-1 text-muted hover:text-ink active:cursor-grabbing"
                  >
                    ⠿
                  </span>
                  <button
                    onClick={() => actions.moveGoalPriority(g.id, -1)}
                    disabled={i === 0}
                    aria-label={`Raise ${g.name} priority`}
                    className="grid h-4 w-5 place-items-center text-[10px] text-muted hover:text-ink disabled:opacity-25"
                  >
                    ▲
                  </button>
                  <span className="font-mono text-[11px] font-bold text-ink" aria-hidden>
                    {i + 1}
                  </span>
                  <button
                    onClick={() => actions.moveGoalPriority(g.id, 1)}
                    disabled={i === ordered.length - 1}
                    aria-label={`Lower ${g.name} priority`}
                    className="grid h-4 w-5 place-items-center text-[10px] text-muted hover:text-ink disabled:opacity-25"
                  >
                    ▼
                  </button>
                </div>

                <div className="min-w-0 flex-1">
                  {/* Name + target-year stepper */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span>{g.emoji}</span>
                      <span className="truncate text-sm font-semibold">{g.name}</span>
                      {!g.tenureConfirmed && (
                        <span className="rounded-full bg-brand/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-brand">
                          confirm year
                        </span>
                      )}
                    </div>
                    <div className="flex flex-none items-center gap-1.5">
                      <button
                        onClick={() => actions.setGoalTenure(g.id, g.horizonYears - 1)}
                        disabled={g.horizonYears <= 1}
                        aria-label={`${g.name} target year earlier`}
                        className="grid h-6 w-6 place-items-center rounded-md border border-line text-muted hover:border-ink hover:text-ink disabled:opacity-30"
                      >
                        −
                      </button>
                      <div className="w-12 text-center">
                        <div className="font-mono text-[9px] uppercase tracking-wide text-muted">by</div>
                        <div className="text-sm font-bold leading-none tabular-nums">{year}</div>
                      </div>
                      <button
                        onClick={() => actions.setGoalTenure(g.id, g.horizonYears + 1)}
                        aria-label={`${g.name} target year later`}
                        className="grid h-6 w-6 place-items-center rounded-md border border-line text-muted hover:border-ink hover:text-ink"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div className="mt-0.5 font-mono text-[9px] uppercase tracking-wide text-muted">in {formatYears(g.horizonYears)}</div>

                  {/* Target amount */}
                  <div className="mt-2 flex items-center gap-2">
                    <span className="w-14 flex-none font-mono text-[9px] uppercase tracking-wide text-muted">Target</span>
                    <input
                      type="range"
                      min={50000}
                      max={50000000}
                      step={50000}
                      value={g.targetToday}
                      onChange={(e) => actions.setGoalTarget(g.id, Number(e.target.value))}
                      aria-label={`${g.name} target amount`}
                      className="min-w-0 flex-1"
                    />
                    <span className="w-16 flex-none text-right text-[12px] font-bold tabular-nums">{formatINR(g.targetToday)}</span>
                  </div>

                  {/* Monthly money split */}
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="w-14 flex-none font-mono text-[9px] uppercase tracking-wide text-muted">Monthly</span>
                    <input
                      type="range"
                      min={0}
                      max={Math.max(1, s.monthlySip)}
                      step={500}
                      value={Math.round(amount)}
                      onChange={(e) => actions.setGoalAmount(g.id, Number(e.target.value))}
                      aria-label={`${g.name} monthly amount`}
                      className="min-w-0 flex-1"
                      disabled={s.monthlySip <= 0}
                    />
                    <span className="w-16 flex-none text-right">
                      <span className="text-[12px] font-bold tabular-nums">{formatINR(amount)}</span>
                      <span className="block font-mono text-[9px] uppercase text-muted">{sharePct}%</span>
                    </span>
                  </div>

                  {/* On-track bar */}
                  <div className="mt-2">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
                      <div
                        className="h-full rounded-full transition-[width] duration-500 ease-out"
                        style={{ width: `${progress * 100}%`, background: r.onTrack ? "#1A1AFF" : "#0A0A0A" }}
                      />
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2 font-mono text-[9px] uppercase tracking-wide">
                      <span className={r.onTrack ? "text-brand" : "text-muted"}>
                        {r.onTrack ? "On track" : `Short by ${formatINR(Math.abs(r.gap))}`}
                      </span>
                      <button
                        onClick={() => {
                          actions.setCurrentGoal(g.id);
                          actions.goPortfolio();
                        }}
                        className="font-mono text-[9px] uppercase tracking-wide text-muted underline-offset-2 hover:text-ink hover:underline"
                      >
                        Edit investments →
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
