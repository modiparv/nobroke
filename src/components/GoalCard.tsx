import { useState } from "react";
import type { PlanGoal } from "../lib/types";
import { computePlan } from "../lib/finance";
import { formatINR, formatYears } from "../lib/format";
import { actions, goalMonthly, planInputsForGoal, useStore } from "../store";
import { sectionLabel } from "../ui";
import Metrics from "./Metrics";
import Insights from "./Insights";
import PortfolioBuilder from "./PortfolioBuilder";

const BASE_YEAR = new Date().getFullYear();

const stepper =
  "grid h-7 w-7 flex-none place-items-center rounded-md border border-line text-muted transition hover:border-ink hover:text-ink disabled:opacity-30";

export interface GoalCardProps {
  g: PlanGoal;
  /** 1-based rank in priority order. */
  rank: number;
  count: number;
  open: boolean;
  onToggle: () => void;
  onDelete: () => void;
  dragActive: boolean;
  isDragging: boolean;
  isOver: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: () => void;
  onDrop: () => void;
}

/**
 * One goal, end-to-end. Collapsed it's a scannable summary (name, year, money,
 * on-track); expanded it reveals everything for THAT goal in one place — the
 * plan controls, the projection metrics and the portfolio builder — so a goal
 * and its portfolio never live on separate screens.
 */
export default function GoalCard({
  g,
  rank,
  count,
  open,
  onToggle,
  onDelete,
  dragActive,
  isDragging,
  isOver,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: GoalCardProps) {
  const s = useStore();
  const [showWhy, setShowWhy] = useState(false);

  const inputs = planInputsForGoal(s, g);
  const r = computePlan(inputs);
  const amount = goalMonthly(s, g.id);
  const sharePct = s.monthlySip > 0 ? Math.round((amount / s.monthlySip) * 100) : 0;
  const progress = Math.max(0, Math.min(1, r.progress));
  const year = BASE_YEAR + g.horizonYears;

  return (
    <li
      onDragOver={(e) => {
        if (!dragActive) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        onDragOver();
      }}
      onDrop={(e) => {
        // Only handle goal reordering — let fund drops bubble to the builder's basket.
        if (!dragActive) return;
        e.preventDefault();
        onDrop();
      }}
      className={`rounded-2xl border bg-white transition ${
        isOver ? "border-brand ring-2 ring-brand/30" : open ? "border-ink" : "border-line"
      } ${isDragging ? "opacity-50" : ""}`}
    >
      <div className="flex items-stretch gap-1.5 p-3 sm:gap-2.5 sm:p-4">
        {/* Priority rail — drag handle + keyboard reorder (only when there's more than one goal) */}
        {count > 1 && (
          <div className="flex flex-none flex-col items-center pt-0.5">
            <span
              draggable
              onDragStart={(e) => {
                onDragStart();
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragEnd={onDragEnd}
              role="button"
              aria-label={`Drag to reorder ${g.name}`}
              title="Drag to reorder"
              className="cursor-grab select-none px-1 text-muted hover:text-ink active:cursor-grabbing"
            >
              ⠿
            </span>
            <button
              onClick={() => actions.moveGoalPriority(g.id, -1)}
              disabled={rank === 1}
              aria-label={`Raise ${g.name} priority`}
              className="grid h-4 w-5 place-items-center text-[10px] text-muted hover:text-ink disabled:opacity-25"
            >
              ▲
            </button>
            <span className="font-mono text-[11px] font-bold text-ink" aria-hidden>
              {rank}
            </span>
            <button
              onClick={() => actions.moveGoalPriority(g.id, 1)}
              disabled={rank === count}
              aria-label={`Lower ${g.name} priority`}
              className="grid h-4 w-5 place-items-center text-[10px] text-muted hover:text-ink disabled:opacity-25"
            >
              ▼
            </button>
          </div>
        )}

        <div className="min-w-0 flex-1">
          {/* Summary header — tap anywhere here to open/close the goal */}
          <button
            onClick={onToggle}
            aria-expanded={open}
            className="flex w-full items-center gap-2 text-left"
          >
            <span className="text-lg leading-none">{g.emoji}</span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-[15px] font-bold">{g.name}</span>
                {!g.tenureConfirmed && (
                  <span className="flex-none rounded-full bg-brand/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-brand">
                    confirm year
                  </span>
                )}
              </span>
              <span className="block font-mono text-[10px] uppercase tracking-wide text-muted">
                by {year} · in {formatYears(g.horizonYears)}
              </span>
            </span>
            <span className="flex flex-none flex-col items-end">
              <span className="text-sm font-bold leading-none tabular-nums">
                {formatINR(amount)}
                <span className="text-[10px] font-normal text-muted">/mo</span>
              </span>
              <span className="mt-0.5 font-mono text-[10px] text-muted">{sharePct}%</span>
            </span>
            <span
              className={`flex-none rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                r.onTrack ? "bg-brand text-white" : "bg-ink text-white"
              }`}
            >
              {r.onTrack ? "On track" : "Catching up"}
            </span>
            <span
              aria-hidden
              className={`flex-none text-muted transition-transform duration-200 ${open ? "rotate-180" : ""}`}
              style={{ display: "inline-block" }}
            >
              ▾
            </span>
          </button>

          {/* On-track bar (always visible) */}
          <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full transition-[width] duration-500 ease-out"
              style={{ width: `${progress * 100}%`, background: r.onTrack ? "#0031F5" : "#121212" }}
            />
          </div>
          {!r.onTrack && (
            <div className="mt-1 font-mono text-[10px] uppercase tracking-wide text-muted">
              Short by {formatINR(Math.abs(r.gap))} · bridge with {formatINR(r.requiredSip)}/mo
            </div>
          )}

          {/* Expanded: plan controls + metrics + portfolio builder — everything for this goal */}
          {open && (
            <div className="mt-4 flex flex-col gap-5 border-t border-line pt-4">
              {/* Plan controls */}
              <div>
                <span className={sectionLabel}>The plan</span>
                <div className="mt-3 flex flex-col gap-3.5">
                  {/* Target year */}
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[13px] text-muted">When do you need it?</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => actions.setGoalTenure(g.id, g.horizonYears - 1)}
                        disabled={g.horizonYears <= 1}
                        aria-label={`${g.name} target year earlier`}
                        className={stepper}
                      >
                        −
                      </button>
                      <div className="w-16 text-center">
                        <div className="text-base font-bold leading-none tabular-nums">{year}</div>
                        <div className="font-mono text-[9px] uppercase tracking-wide text-muted">
                          in {formatYears(g.horizonYears)}
                        </div>
                      </div>
                      <button
                        onClick={() => actions.setGoalTenure(g.id, g.horizonYears + 1)}
                        aria-label={`${g.name} target year later`}
                        className={stepper}
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* Target amount */}
                  <div>
                    <div className="mb-1 flex items-baseline justify-between gap-2">
                      <span className="text-[13px] text-muted">How much (in today's money)?</span>
                      <span className="text-sm font-bold tabular-nums">{formatINR(g.targetToday)}</span>
                    </div>
                    <input
                      type="range"
                      min={50000}
                      max={50000000}
                      step={50000}
                      value={g.targetToday}
                      onChange={(e) => actions.setGoalTarget(g.id, Number(e.target.value))}
                      aria-label={`${g.name} target amount`}
                      className="w-full"
                    />
                  </div>

                  {/* Monthly money split */}
                  <div>
                    <div className="mb-1 flex items-baseline justify-between gap-2">
                      <span className="text-[13px] text-muted">Monthly money for this goal</span>
                      <span className="text-sm font-bold tabular-nums">
                        {formatINR(amount)} <span className="font-mono text-[10px] font-normal text-muted">{sharePct}%</span>
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={Math.max(1, s.monthlySip)}
                      step={500}
                      value={Math.round(amount)}
                      onChange={(e) => actions.setGoalAmount(g.id, Number(e.target.value))}
                      aria-label={`${g.name} monthly amount`}
                      className="w-full"
                      disabled={s.monthlySip <= 0}
                    />
                  </div>
                </div>
              </div>

              {/* Plan summary */}
              <Metrics r={r} goal={g} inflation={s.inflation} />

              {/* Why this plan — the old "What NoBroke sees" insights, on demand */}
              <div>
                <button
                  onClick={() => setShowWhy((v) => !v)}
                  className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-muted transition hover:text-ink"
                >
                  <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-brand" />
                  {showWhy ? "Hide the why" : "Why this plan?"}
                </button>
                {showWhy && (
                  <div className="mt-2">
                    <Insights r={r} inputs={inputs} />
                  </div>
                )}
              </div>

              {/* The portfolio for this goal */}
              <div className="rounded-2xl border border-line bg-paper p-3 sm:p-4">
                <PortfolioBuilder />
              </div>

              <div className="flex justify-end">
                <button
                  onClick={onDelete}
                  className="font-mono text-[10px] uppercase tracking-wide text-muted underline-offset-2 transition hover:text-ink hover:underline"
                >
                  Delete this goal
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
