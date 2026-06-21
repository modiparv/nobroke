import { useState } from "react";
import type { PlanGoal } from "../lib/types";
import { computePlan } from "../lib/finance";
import { formatINR, formatYears } from "../lib/format";
import { actions, goalMonthly, planInputsForGoal, useStore } from "../store";
import { sectionLabel } from "../ui";
import { C } from "../lib/theme";
import MoneyInput from "./MoneyInput";
import Chart from "./Chart";
import Metrics from "./Metrics";
import Insights from "./Insights";

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
            {/* On-track: a compact dot on phones, the full pill on larger screens */}
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 flex-none self-center rounded-full sm:hidden"
              style={{ background: r.onTrack ? C.positive : C.ink }}
            />
            <span
              className={`hidden flex-none rounded-full px-2 py-0.5 text-[10px] font-semibold sm:inline-flex ${
                r.onTrack ? "bg-positive text-white" : "bg-ink text-white"
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
              style={{ width: `${progress * 100}%`, background: r.onTrack ? C.positive : C.ink }}
            />
          </div>
          {!r.onTrack && (
            <div className="mt-1 font-mono text-[10px] uppercase tracking-wide text-muted">
              {formatINR(Math.abs(r.gap))} short · add {formatINR(r.requiredSip)}/mo to catch up
            </div>
          )}

          {/* Expanded: plan controls + metrics + portfolio builder — everything for this goal */}
          {open && (
            <div className="mt-4 flex flex-col gap-5 border-t border-line pt-4">
              {/* Plan controls */}
              <div>
                <span className={sectionLabel}>Set up this goal</span>
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
                  <MoneyInput
                    label="How much (in today's money)?"
                    value={g.targetToday}
                    onChange={(v) => actions.setGoalTarget(g.id, v)}
                    step={50000}
                    min={50000}
                    max={50000000}
                    compact
                  />

                  {/* Monthly money split */}
                  <MoneyInput
                    label="Monthly money for this goal"
                    hint={`${sharePct}% of your monthly money`}
                    value={Math.round(amount)}
                    onChange={(v) => actions.setGoalAmount(g.id, v)}
                    step={500}
                    min={0}
                    max={Math.max(1, s.monthlySip)}
                    disabled={s.monthlySip <= 0}
                    compact
                  />
                </div>
              </div>

              {/* Plan summary */}
              <Metrics r={r} goal={g} inflation={s.inflation} />

              {/* This goal's trajectory — its share of the money, grown in the shared portfolio */}
              <div>
                <span className={sectionLabel}>How your money grows toward {g.name}</span>
                <Chart r={r} />
              </div>

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
