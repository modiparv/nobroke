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

/**
 * The goal surface, in two halves. GoalTile: one compact card in the row of
 * every goal — rank, name, target, the saved-over-target rail — selectable
 * and draggable to reorder. GoalDetail: the selected goal's full workbench
 * (target year, amounts, metrics, path, insights). The plan page shows all
 * tiles at once and one detail beneath, so goals compare at a glance and
 * the controls never shove the list around.
 */

/** The rail binds to saved over target and nothing else (spec 10.2): both
 *  figures in today's rupees, so the bar never overstates a healthy SIP. */
function goalFacts(g: PlanGoal, s: ReturnType<typeof useStore>) {
  const inputs = planInputsForGoal(s, g);
  const r = computePlan(inputs);
  const savedForGoal = totalCapital(s) * goalShareFraction(s, g.id);
  const savedRatio = g.targetToday > 0 ? savedForGoal / g.targetToday : 0;
  return { inputs, r, savedForGoal, savedRatio, railPct: Math.max(0, Math.min(1, savedRatio)) * 100, year: BASE_YEAR + g.horizonYears };
}

export interface GoalTileProps {
  g: PlanGoal;
  /** 1-based rank in priority order. The numbered corner IS the priority marker. */
  rank: number;
  selected: boolean;
  onSelect: () => void;
  dragActive: boolean;
  isDragging: boolean;
  isOver: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: () => void;
  onDrop: () => void;
}

export function GoalTile({
  g,
  rank,
  selected,
  onSelect,
  dragActive,
  isDragging,
  isOver,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: GoalTileProps) {
  const s = useStore();
  const { r, savedForGoal, savedRatio, railPct, year } = goalFacts(g, s);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      draggable
      onDragStart={(e) => {
        onDragStart();
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragEnd={onDragEnd}
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
      title={`${g.name} · priority ${rank}. Tap to open, drag to reorder.`}
      className={`min-w-0 rounded-card border bg-surface p-3 text-left transition sm:p-3.5 ${
        selected ? "border-text" : "border-line hover:border-line-2"
      } ${isOver ? "bg-accent-tint" : ""} ${isDragging ? "opacity-50" : ""}`}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="num text-index tracking-[0.06em] text-muted">{String(rank).padStart(2, "0")}</span>
        <span
          aria-hidden
          className={`h-2 w-2 flex-none rounded-full ${r.onTrack ? "bg-pos" : "bg-cau"}`}
        />
        <span className="sr-only">{r.onTrack ? "On track" : "Needs a change"}</span>
      </span>
      <span className="mt-1.5 block truncate text-row font-medium tracking-[-0.005em]">{g.name}</span>
      <span className="num mt-0.5 block truncate text-caption text-muted">
        {formatINR(g.targetToday)} by {year}
      </span>
      <span className="mt-2.5 block h-[3px] w-full overflow-hidden rounded-[2px] bg-surface-2">
        <span
          className="block h-full rounded-[2px] bg-text transition-[width] duration-500 ease-out"
          style={{ width: `${railPct}%` }}
        />
      </span>
      <span className="num mt-1.5 flex items-baseline justify-between gap-2 text-caption">
        <span className="font-medium text-text">{formatINR(savedForGoal)}</span>
        <span className="text-muted">{Math.round(savedRatio * 100)}%</span>
      </span>
    </button>
  );
}

export function GoalDetail({ g, onDelete }: { g: PlanGoal; onDelete: () => void }) {
  const s = useStore();
  const [showWhy, setShowWhy] = useState(false);
  const { inputs, r, savedForGoal, year } = goalFacts(g, s);
  const amount = s.monthlySip * goalShareFraction(s, g.id);

  return (
    <section className="overflow-hidden rounded-card border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-b border-line px-3 py-3 sm:px-4">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-section font-medium tracking-[-0.015em]">{g.name}</span>
          <span
            // Status is carried by the pill, never by a coloured number.
            className={`flex-none rounded-full px-2 py-0.5 text-caption ${
              r.onTrack ? "bg-pos-bg text-pos" : "bg-cau-bg text-cau"
            }`}
          >
            {r.onTrack ? "On track" : "Needs a change"}
          </span>
        </span>
        <span className="num text-support text-text-2">
          <span className="font-medium text-text">{formatINR(savedForGoal)}</span> saved of{" "}
          <span className="font-medium text-text">{formatINR(g.targetToday)}</span>
        </span>
      </div>

      <div className="flex flex-col gap-5 px-3 pb-5 pt-4 sm:px-4">
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
              label="Target amount"
              value={g.targetToday}
              onChange={(v) => actions.setGoalTarget(g.id, v)}
              step={50000}
              min={50000}
              max={50000000}
              compact
            />

            <MoneyInput
              label="Monthly amount"
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
          <span className={sectionLabel}>Path to {g.name}</span>
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
    </section>
  );
}
