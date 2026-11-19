import { useState } from "react";
import type { PlanGoal } from "../lib/types";
import { computePlan } from "../lib/finance";
import { formatINR } from "../lib/format";
import { gapLevel } from "../lib/gap";
import { FOCUS } from "../lib/links";
import { useFocus } from "../lib/useFocus";
import { reachFigure } from "../lib/verdict";
import { actions, capitalForGoal, goalMonthly, goalShareFraction, goalsByPriority, planInputsForGoal, useStore } from "../store";
import { GAP_TEXT } from "../ui";
import Chart from "./Chart";
import Metrics from "./Metrics";
import Insights from "./Insights";
import MoneyInput, { StepGlyph, fieldCompact, fieldLabel, fieldRow, fieldShell, fieldStep } from "./MoneyInput";
import StatusPill from "./StatusPill";

const BASE_YEAR = new Date().getFullYear();

const label = "text-support font-medium text-text-2";
const textLink = "text-support font-medium text-text underline underline-offset-2 transition hover:text-text-2";

/**
 * The goal surface, in two halves. GoalTile: one row in the list of every
 * goal (rank, name, target, the saved-over-target bar, the status as icon
 * and word), selectable and draggable to reorder. GoalDetail: the selected
 * goal's full workbench (date, amounts, the projection, the path, the
 * reasons). The plan page shows every row at once and one detail beneath,
 * so goals compare line by line and the controls never shove the list
 * around.
 */

/** The facts every goal surface shares: the plan result and the capital
 *  already set aside (this goal's share of everything held). */
function goalFacts(g: PlanGoal, s: ReturnType<typeof useStore>) {
  const inputs = planInputsForGoal(s, g);
  const r = computePlan(inputs);
  const savedForGoal = capitalForGoal(s, g.id);
  return { inputs, r, savedForGoal, year: BASE_YEAR + g.horizonYears };
}

export interface GoalTileProps {
  g: PlanGoal;
  /** 1-based rank in priority order. The number IS the priority marker. */
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

/**
 * One goal, one row. On a phone it stacks: name, then target and status,
 * then the bar with its two amounts. From the md breakpoint the same parts
 * sit on one line in fixed columns, so every row's bar and status line up
 * with the rows above and below. A row is as wide as the list, so three
 * goals never leave a tile on its own.
 */
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
  const { r, savedForGoal, year } = goalFacts(g, s);
  const need = r.requiredCorpus;
  const savedPct = need > 0 ? Math.max(0, Math.min(1, savedForGoal / need)) * 100 : 0;
  const level = gapLevel(r);
  const ground = isOver ? "bg-accent-tint shadow-[inset_0_2px_0_0_rgb(var(--text))]" : selected ? "bg-surface-2" : "bg-surface hover:bg-bg";

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
      title={`${g.name}, priority ${rank}. Tap to open, drag to reorder.`}
      // The focus ring sits inside the row: the list clips anything outside it.
      className={`relative block w-full px-3 py-3.5 text-left transition-colors focus-visible:-outline-offset-2 sm:px-4 ${ground} ${isDragging ? "opacity-50" : ""}`}
    >
      {/* The selected row: an ink bar on its left edge, so it also reads in greyscale. */}
      {selected && <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-text" />}
      <span className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-x-2 md:grid-cols-[1.25rem_minmax(0,5fr)_minmax(0,7fr)_7.5rem] md:gap-x-5">
        <span className="num col-start-1 row-start-1 text-support text-text-2">{rank}</span>
        <span className="col-span-2 col-start-2 row-start-1 break-words text-row font-medium text-text md:col-span-1 md:col-start-2">{g.name}</span>
        {/* The cost by its date, in that year's rupees: the figure the bar and
            the shortfall beside it are measured against. */}
        <span className="num col-start-2 row-start-2 mt-0.5 whitespace-nowrap text-support text-text-2">
          {formatINR(r.requiredCorpus)} by {year}
        </span>
        <StatusPill level={level} className="col-start-3 row-start-2 justify-self-end md:col-start-4 md:row-span-2 md:row-start-1" />
        {/* One bar, one meaning: what is set aside against what the goal
            will cost by its date. The line under it carries the projection
            in words. */}
        <span className="col-span-2 col-start-2 row-start-3 mt-3 block md:col-span-1 md:col-start-3 md:row-span-2 md:row-start-1 md:mt-0">
          <span
            className={`block h-1.5 w-full overflow-hidden rounded-full ${selected ? "bg-line-2" : "bg-line"}`}
            title={`Set aside ${formatINR(savedForGoal)} of ${formatINR(r.requiredCorpus)} needed by ${year}`}
          >
            <span
              className="block h-full rounded-full bg-text transition-[width] duration-500 ease-out motion-reduce:transition-none"
              style={{ width: `${savedPct}%` }}
            />
          </span>
          <span className="num mt-1.5 flex flex-wrap items-baseline justify-between gap-x-3 text-support">
            <span className="whitespace-nowrap font-medium text-text">{formatINR(savedForGoal)} saved</span>
            <span className={`whitespace-nowrap ${GAP_TEXT[level]}`}>
              {r.onTrack ? `will reach ${formatINR(reachFigure(r))}` : `short ${formatINR(Math.abs(r.gap))}`}
            </span>
          </span>
        </span>
      </span>
    </button>
  );
}

export function GoalDetail({ g, onDelete }: { g: PlanGoal; onDelete: () => void }) {
  const s = useStore();
  const [showWhy, setShowWhy] = useState(false);
  const { inputs, r, savedForGoal, year } = goalFacts(g, s);
  const amount = s.monthlySip * goalShareFraction(s, g.id);
  // What this goal could take without touching the others, and which goals
  // ahead of it are taking the money today.
  const othersMonthly = s.goals.filter((x) => x.id !== g.id).reduce((sum, x) => sum + goalMonthly(s, x.id), 0);
  const available = Math.max(0, s.monthlySip - othersMonthly);
  const ahead = goalsByPriority(s)
    .filter((x) => x.id !== g.id && goalMonthly(s, x.id) > 0)
    .map((x) => ({ name: x.name, year: BASE_YEAR + x.horizonYears }));
  // A row on Money's "By goal", and the band's "Fix" button, land here.
  const focus = useFocus(FOCUS.goalDetail);

  return (
    <section className={`relative overflow-hidden rounded-card border border-line bg-surface ${focus.active ? "focus-flash" : ""}`}>
      {/* Where a link lands. The page centres this point on screen, and it
          sits a third of a screen below the card's top edge, so the card
          arrives with its name just under the header instead of with its
          middle on screen and its name scrolled away. */}
      <span ref={focus.ref} aria-hidden className="pointer-events-none absolute left-0 top-[36vh] h-px w-px" />

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line px-4 py-3.5 sm:px-5">
        <span className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
          <h2 className="text-headline font-medium text-text">{g.name}</h2>
          {/* Status is carried by the pill (icon and word), never by a coloured number. */}
          <StatusPill level={gapLevel(r)} />
        </span>
        <span className="num text-support text-text-2">
          <span className="whitespace-nowrap">{formatINR(g.targetToday)} today,</span>{" "}
          <span className="whitespace-nowrap">
            {formatINR(r.requiredCorpus)} by {year}
          </span>
        </span>
      </div>

      <div className="flex flex-col gap-6 px-4 pb-5 pt-4 sm:px-5">
        <div>
          <h3 className={label}>Goal details</h3>
          <div className="mt-3 flex flex-col gap-3.5">
            {/* The year wears the money fields' shell, so the three line up. */}
            <div className={`min-w-0 ${fieldRow}`}>
              <div className={`mb-1.5 sm:mb-0 ${fieldLabel}`}>By when</div>
              <div className={`${fieldShell} ${fieldCompact}`}>
                <span className="num flex min-w-0 flex-1 items-center pl-3 text-row font-medium text-text" aria-live="polite">
                  {year}
                </span>
                <button
                  type="button"
                  onClick={() => actions.setGoalTenure(g.id, g.horizonYears - 1)}
                  disabled={g.horizonYears <= 1}
                  aria-label={`${g.name} target year earlier`}
                  className={fieldStep}
                >
                  <StepGlyph />
                </button>
                <button
                  type="button"
                  onClick={() => actions.setGoalTenure(g.id, g.horizonYears + 1)}
                  aria-label={`${g.name} target year later`}
                  className={fieldStep}
                >
                  <StepGlyph plus />
                </button>
              </div>
            </div>

            {/* Steps that suit the size: a ₹25k emergency fund moves in
                thousands, a ₹30L down payment in half-lakhs. */}
            <MoneyInput
              label="How much (today's prices)"
              value={g.targetToday}
              onChange={(v) => actions.setGoalTarget(g.id, v)}
              step={g.targetToday >= 1000000 ? 50000 : g.targetToday >= 100000 ? 10000 : 5000}
              min={1000}
              max={50000000}
              compact
              row
            />

            <MoneyInput
              label="Every month"
              value={Math.round(amount)}
              onChange={(v) => actions.setGoalAmount(g.id, v)}
              step={500}
              min={0}
              max={Math.max(1, s.monthlySip)}
              disabled={s.monthlySip <= 0}
              compact
              row
            />
          </div>
        </div>

        <Metrics
          r={r}
          inputs={inputs}
          goal={g}
          inflation={s.inflation}
          saved={savedForGoal}
          monthly={amount}
          monthlyShare={goalShareFraction(s, g.id)}
          monthlyPool={s.monthlySip}
          available={available}
          ahead={ahead}
        />

        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h3 className={label}>How {g.name} grows</h3>
            {/* Every goal is funded from the one mix: the funds list on the
                Portfolio tab is where this money is invested today. */}
            <button
              type="button"
              onClick={() => actions.setTab("portfolio", { focus: FOCUS.funds })}
              className={`${textLink} -my-3 inline-flex h-11 items-center whitespace-nowrap`}
            >
              Where this money is invested
            </button>
          </div>
          <Chart r={r} />
        </div>

        {/* The reasons are always in view: the verdict and any caution (a
            lot in stocks for a near goal, say) show by default; the rest
            unfolds. */}
        <div>
          <h3 className={label}>Why we say this</h3>
          <div className="mt-2">
            <Insights r={r} inputs={inputs} expanded={showWhy} />
          </div>
          <button
            type="button"
            onClick={() => setShowWhy((v) => !v)}
            aria-expanded={showWhy}
            className={`${textLink} inline-flex h-11 items-center`}
          >
            {showWhy ? "Less" : "More"}
          </button>
        </div>

        {/* The person's own words on this goal, kept with the plan. */}
        <div>
          <h3 className={label}>Notes</h3>
          <textarea
            value={g.notes ?? ""}
            onChange={(e) => actions.setGoalNotes(g.id, e.target.value)}
            // A browser brings only a textarea's caret into view on focus and
            // ignores the scroll margin, so the field could stay under the
            // header. This brings the whole field clear, and moves nothing
            // when it already is.
            onFocus={(e) => e.currentTarget.scrollIntoView({ block: "nearest" })}
            rows={3}
            maxLength={2000}
            aria-label={`Notes for ${g.name}`}
            placeholder='Notes, e.g. "Papa is paying half. Flights are booked."'
            className="mt-2 block min-h-[5.5rem] w-full resize-none rounded-control border border-line-2 bg-surface px-3 py-2.5 text-body text-text outline-none transition focus:border-text focus:ring-1 focus:ring-text focus-visible:outline-none [field-sizing:content]"
          />
        </div>

        <div className="-mb-2 flex justify-end">
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex h-11 items-center text-support text-text-2 underline underline-offset-2 transition hover:text-text"
          >
            Delete this goal
          </button>
        </div>
      </div>
    </section>
  );
}
