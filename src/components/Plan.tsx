import { useState } from "react";
import { GOALS } from "../lib/goals";
import { allocationTotal, bandWeights, computePlan } from "../lib/finance";
import { formatINR } from "../lib/format";
import { actions, goalsByPriority, holdingsTotal, planInputsForGoal, totalCapital, useStore } from "../store";
import { btnPrimary, card, sectionLabel } from "../ui";
import AdvisorNote from "./AdvisorNote";
import MacroCard from "./MacroCard";
import AppHeader from "./AppHeader";
import GoalCard from "./GoalCard";
import MoneyTab from "./MoneyTab";
import PortfolioBuilder from "./PortfolioBuilder";

const inrDigits = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/** Hero figure, one clean weight and colour. */
function HeroAmount({ value }: { value: number }) {
  return (
    <div className="num mt-1 text-2xl font-medium tracking-[-0.02em] text-on-night sm:text-3xl">
      ₹{inrDigits.format(Math.max(0, Math.round(value)))}
    </div>
  );
}

/** Plain-language description of the one shared mix. Never a percentage here. */
function mixLabel(alloc: Record<string, number>): string {
  const total = allocationTotal(alloc);
  if (total <= 0) return "Not invested yet";
  const equityShare = bandWeights(alloc).equity / total;
  if (equityShare >= 0.65) return "Invested in a mostly-stocks mix";
  if (equityShare <= 0.35) return "Invested in a mostly-bonds mix";
  return "Invested in a balanced mix";
}

function Pill({ label, onClick, accent, onBand }: { label: string; onClick: () => void; accent?: boolean; onBand?: boolean }) {
  const tone = accent
    ? "bg-on-night text-night hover:opacity-85"
    : onBand
      ? "border border-on-night-3/60 text-on-night hover:border-on-night-2"
      : "border border-line text-text hover:border-line-2";
  return (
    <button onClick={onClick} className={`inline-flex h-9 items-center rounded-full px-3.5 text-support transition ${tone}`}>
      {label}
    </button>
  );
}

function AddGoal({ onAdd, onBand }: { onAdd: (id: string) => void; onBand?: boolean }) {
  const s = useStore();
  const [open, setOpen] = useState(false);
  const remaining = GOALS.filter((g) => !s.goals.some((x) => x.id === g.id));

  return (
    <span className="relative inline-block">
      <Pill label="New goal" onBand={onBand} onClick={() => setOpen((o) => !o)} />
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-[calc(100%+8px)] z-20 flex max-h-72 w-60 flex-col overflow-y-auto rounded-card border border-line bg-surface p-1.5 sm:left-auto sm:right-0">
            {remaining.length === 0 && <span className="p-3 text-center text-support text-text-2">All goals added</span>}
            {remaining.map((g) => (
              <button
                key={g.id}
                onClick={() => {
                  onAdd(g.id);
                  setOpen(false);
                }}
                className="rounded-control px-3 py-2 text-left text-support hover:bg-surface-2"
              >
                {g.name}
              </button>
            ))}
          </div>
        </>
      )}
    </span>
  );
}

/**
 * The plan screen.
 *
 * Two panes side by side on desktop, split 60/40: goals are the major pane
 * because they are the object the user manipulates; the investment mix rides
 * alongside at 40 percent. Below 1024px the mix drops beneath the goals.
 */
export default function Plan() {
  const s = useStore();
  const ordered = goalsByPriority(s);

  const [openId, setOpenId] = useState<string>(() => s.currentGoalId);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const plans = ordered.map((g) => ({ g, r: computePlan(planInputsForGoal(s, g)) }));
  const onTrackCount = plans.filter((p) => p.r.onTrack).length;
  const firstOffTrack = plans.find((p) => !p.r.onTrack)?.g;

  const openGoal = (id: string) => {
    actions.setCurrentGoal(id);
    setOpenId(id);
  };
  const toggle = (id: string) => (openId === id ? setOpenId("") : openGoal(id));
  const addGoal = (id: string) => {
    actions.addGoal(id);
    setOpenId(id);
  };
  const del = (g: { id: string; name: string }) => {
    if (window.confirm(`Remove "${g.name}"? Its money is shared across your other goals.`)) {
      actions.removeGoal(g.id);
      setOpenId("");
    }
  };

  if (s.tab === "money") {
    return (
      <div className="min-h-screen bg-bg">
        <AppHeader />
        <MoneyTab />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg">
      <AppHeader />

      {/* The overview band: night ground, same palette as the landing. Kept
          shallow so the goals surface above the fold. */}
      <section className="bg-night">
        <div className="mx-auto flex max-w-page flex-col gap-3 px-4 py-4 sm:flex-row sm:items-end sm:justify-between sm:px-6 sm:py-5">
          <div>
            <span className="text-eyebrow uppercase text-on-night-2">Total saved</span>
            <HeroAmount value={totalCapital(s)} />
            <p className="mt-1 text-support text-on-night-2">
              {s.goals.length
                ? `${onTrackCount} of ${s.goals.length} ${s.goals.length === 1 ? "goal" : "goals"} on track`
                : "Add a goal to start your plan"}
            </p>

            {/* The breakup, inline in the band on a hairline divider. */}
            <dl className="mt-3 flex flex-wrap items-stretch gap-x-6 gap-y-2 border-t border-on-night-3/40 pt-2.5">
              {[
                { label: "Cash", v: s.currentSavings },
                { label: "Invested", v: holdingsTotal(s) },
                { label: "Monthly", v: s.monthlySip },
              ].map(({ label, v }) => (
                <div key={label}>
                  <dt className="text-eyebrow uppercase text-on-night-3">{label}</dt>
                  <dd className="num mt-0.5 text-support font-medium text-on-night">{formatINR(v)}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Pill label="Add money" onBand onClick={() => actions.setTab("money")} />
            <AddGoal onAdd={addGoal} onBand />
            {firstOffTrack && (
              <Pill label={`Fix ${firstOffTrack.name.toLowerCase()}`} accent onClick={() => openGoal(firstOffTrack.id)} />
            )}
          </div>
        </div>
      </section>

      {/* 88px of bottom padding keeps the sticky copilot clear of the content. */}
      <div className="mx-auto max-w-page px-4 pb-[88px] sm:px-6">
        <div className={`grid gap-4 py-5 ${s.goals.length ? "lg:grid-cols-[minmax(0,11fr)_minmax(0,9fr)] lg:items-start" : ""}`}>
          {/* Goals: the major pane (60 percent on desktop). */}
          <div className="flex min-w-0 flex-col gap-4">
            {s.goals.length > 0 && <AdvisorNote />}

            {s.goals.length === 0 ? (
              <div className={`${card} py-10 text-center`}>
                <p className="text-row font-medium">No goals yet</p>
                <p className="mx-auto mt-1 max-w-xs text-support text-text-2">Add your first goal, or start a fresh plan.</p>
                <button className={`${btnPrimary} mt-4`} onClick={actions.startOnboarding}>
                  Start a new plan
                </button>
              </div>
            ) : (
              <section className="overflow-hidden rounded-card border border-line bg-surface">
                {/* The card's own header carries the split action: no floating
                    rows spending vertical space outside it. */}
                <div className="flex items-center justify-between gap-3 border-b border-line px-3 py-2.5 sm:px-4">
                  <span className={sectionLabel}>Goals · priority order</span>
                  {s.goals.length > 1 && (
                    <button
                      type="button"
                      onClick={actions.recommendGoalSplit}
                      className="text-support font-medium text-text underline underline-offset-2 transition hover:text-text-2"
                    >
                      Use recommended split
                    </button>
                  )}
                </div>
                <ul className="divide-y divide-line" aria-label="Your goals">
                {ordered.map((g, i) => (
                  <GoalCard
                    key={g.id}
                    g={g}
                    rank={i + 1}
                    count={ordered.length}
                    open={openId === g.id}
                    onToggle={() => toggle(g.id)}
                    onDelete={() => del(g)}
                    dragActive={dragId !== null}
                    isDragging={dragId === g.id}
                    isOver={overId === g.id && dragId !== g.id}
                    onDragStart={() => setDragId(g.id)}
                    onDragEnd={() => {
                      setDragId(null);
                      setOverId(null);
                    }}
                    onDragOver={() => {
                      if (overId !== g.id) setOverId(g.id);
                    }}
                    onDrop={() => {
                      if (dragId && dragId !== g.id) actions.reorderGoals(dragId, g.id);
                      setDragId(null);
                      setOverId(null);
                    }}
                  />
                ))}
                </ul>
              </section>
            )}
          </div>

          {/* Investment mix: the 40 percent pane, always open beside the goals.
              The macro backdrop rides below it: the numbers behind the plan's
              assumptions, in the pane where the assumptions live. */}
          {s.goals.length > 0 && (
            <div className="flex min-w-0 flex-col gap-4">
              <section className="rounded-card border border-line bg-surface">
                <div className="border-b border-line px-4 py-3">
                  <span className="text-support text-text">{mixLabel(s.portfolio)}</span>
                </div>
                <div className="p-3.5 sm:p-4">
                  <PortfolioBuilder />
                </div>
              </section>
              <MacroCard />
            </div>
          )}
        </div>

        <p className="pb-2 text-center text-caption text-text-2">
          Projections are illustrative and not investment advice.
        </p>
      </div>
    </div>
  );
}
