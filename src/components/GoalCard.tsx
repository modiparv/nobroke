import { useState } from "react";
import type { PlanGoal } from "../lib/types";
import { computePlan } from "../lib/finance";
import { formatINR } from "../lib/format";
import { actions, goalShareFraction, planInputsForGoal, totalCapital, useStore } from "../store";
import { sectionLabel } from "../ui";
import Chart from "./Chart";
import Metrics from "./Metrics";
import Insights from "./Insights";
import MoneyInput from "./MoneyInput";

const BASE_YEAR = new Date().getFullYear();

const stepper =
  "grid h-7 w-7 flex-none place-items-center rounded-[10px] border border-line text-muted transition hover:border-ink hover:text-ink disabled:opacity-30";

export interface GoalCardProps {
  g: PlanGoal;
  /** 1-based rank in priority order. The numbered row IS the priority marker. */
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
 * One goal, as a hairline-separated row rather than a card.
 *
 * The goal is the only object the user manipulates, so everything here is
 * either the goal's own facts or a control over them. Asset mix and funds are
 * consequences and live elsewhere.
 */
export default function GoalCard({
  g,
  rank,
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
  const amount = s.monthlySip * goalShareFraction(s, g.id);
  const year = BASE_YEAR + g.horizonYears;

  /**
   * The rail binds to saved over target and nothing else (spec section 10.2).
   * It previously showed projectedCorpus / requiredCorpus, so a goal with
   * nothing saved but a healthy SIP rendered a full bar, which reads as
   * "nearly funded". Both figures here are in today's rupees so they compare
   * like for like.
   */
  const savedForGoal = totalCapital(s) * goalShareFraction(s, g.id);
  const savedRatio = g.targetToday > 0 ? savedForGoal / g.targetToday : 0;
  const railPct = Math.max(0, Math.min(1, savedRatio)) * 100;

  return (
    <li
      onDragOver={(e) => {
        if (!dragActive) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        onDragOver();
      }}
      onDrop={(e) => {
        if (!dragActive) return;
        e.preventDefault();
        onDrop();
      }}
      className={`transition ${isOver ? "bg-brand/5" : ""} ${isDragging ? "opacity-50" : ""}`}
    >
      <div className="flex items-start gap-3 px-4 py-3.5">
        {/* The index doubles as the priority marker and the drag affordance. */}
        <span
          draggable
          onDragStart={(e) => {
            onDragStart();
            e.dataTransfer.effectAllowed = "move";
          }}
          onDragEnd={onDragEnd}
          role="button"
          aria-label={`${g.name}, priority ${rank}. Drag to reorder.`}
          title="Drag to reorder"
          className="num mt-0.5 cursor-grab select-none pt-px text-index tracking-[0.06em] text-muted active:cursor-grabbing"
        >
          {String(rank).padStart(2, "0")}
        </span>

        <button onClick={onToggle} aria-expanded={open} className="min-w-0 flex-1 text-left">
          <span className="flex items-center gap-2">
            <span className="truncate text-row font-medium tracking-[-0.005em]">{g.name}</span>
            <span
              className={`flex-none rounded-full px-2 py-0.5 text-caption ${
                r.onTrack ? "bg-positive/10 text-positive" : "bg-ink/[0.06] text-ink"
              }`}
            >
              {r.onTrack ? "On track" : "Needs a change"}
            </span>
          </span>
          <span className="mt-0.5 block text-support text-muted">
            <span className="num">{formatINR(g.targetToday)}</span> by <span className="num">{year}</span>
          </span>

          <span className="mt-2.5 block h-[3px] w-full overflow-hidden rounded-[2px] bg-line">
            <span
              className="block h-full rounded-[2px] bg-brand transition-[width] duration-500 ease-out"
              style={{ width: `${railPct}%` }}
            />
          </span>
        </button>

        <span className="flex-none pt-0.5 text-right">
          <span className="num block text-row font-medium">{formatINR(savedForGoal)}</span>
          <span className="num mt-0.5 block text-caption text-muted">{Math.round(savedRatio * 100)}%</span>
        </span>
      </div>

      {open && (
        <div className="flex flex-col gap-5 border-t border-line px-4 pb-5 pt-4">
          <div>
            <span className={sectionLabel}>Set up this goal</span>
            <div className="mt-3 flex flex-col gap-3.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-support text-muted">Target year</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => actions.setGoalTenure(g.id, g.horizonYears - 1)}
                    disabled={g.horizonYears <= 1}
                    aria-label={`${g.name} target year earlier`}
                    className={stepper}
                  >
                    −
                  </button>
                  <span className="num w-14 text-center text-row font-medium">{year}</span>
                  <button
                    onClick={() => actions.setGoalTenure(g.id, g.horizonYears + 1)}
                    aria-label={`${g.name} target year later`}
                    className={stepper}
                  >
                    +
                  </button>
                </div>
              </div>

              <MoneyInput
                label="Target amount, in today's money"
                value={g.targetToday}
                onChange={(v) => actions.setGoalTarget(g.id, v)}
                step={50000}
                min={50000}
                max={50000000}
                compact
              />

              <MoneyInput
                label="Going in each month"
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

          {!r.onTrack && (
            <p className="text-support text-ink">
              On this plan you'd reach about <span className="num">{formatINR(r.projectedCorpus)}</span>.
            </p>
          )}

          <Metrics r={r} goal={g} inflation={s.inflation} />

          <div>
            <span className={sectionLabel}>How your money grows toward {g.name}</span>
            <Chart r={r} />
          </div>

          <div>
            <button
              onClick={() => setShowWhy((v) => !v)}
              className="text-support text-muted underline-offset-2 transition hover:text-ink hover:underline"
            >
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
              className="text-support text-muted underline-offset-2 transition hover:text-ink hover:underline"
            >
              Remove this goal
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
