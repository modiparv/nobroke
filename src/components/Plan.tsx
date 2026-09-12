import { useEffect, useState } from "react";
import { GOALS } from "../lib/goals";
import { computePlan } from "../lib/finance";
import { formatINR } from "../lib/format";
import { actions, goalsByPriority, holdingsTotal, planInputsForGoal, totalCapital, useStore } from "../store";
import { btnPrimary, card, sectionLabel } from "../ui";
import AdvisorNote from "./AdvisorNote";
import AppHeader from "./AppHeader";
import { GoalDetail, GoalTile } from "./GoalCard";
import GoalsChart from "./GoalsChart";
import MoneyTab from "./MoneyTab";
import PortfolioGlimpse from "./PortfolioGlimpse";
import PortfolioTab from "./PortfolioTab";

const inrDigits = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/** Hero figure, one clean weight and colour. */
function HeroAmount({ value }: { value: number }) {
  return (
    <div className="num mt-1.5 text-3xl font-medium tracking-[-0.02em] text-on-night sm:text-4xl">
      ₹{inrDigits.format(Math.max(0, Math.round(value)))}
    </div>
  );
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
 * The plan screen, master–detail. The night band carries the numbers and
 * every trajectory. Beneath it, ALL goals sit in one row of tiles —
 * comparable at a glance, draggable to reorder — with the selected goal's
 * full workbench below on the left and the portfolio glimpse beside it on
 * the right. Tapping a tile, or a goal in the glimpse's heatmap, swaps the
 * workbench; nothing ever shoves the list around.
 */
export default function Plan() {
  const s = useStore();
  const ordered = goalsByPriority(s);

  const [openId, setOpenId] = useState<string>(() => s.currentGoalId);

  // The glimpse's "By goal" tiles call setCurrentGoal; opening that goal here
  // is what makes the two panes feel like ONE synced view.
  useEffect(() => {
    if (s.currentGoalId) setOpenId(s.currentGoalId);
  }, [s.currentGoalId]);

  // A tab change is a page change: start at the top, never mid-scroll of
  // the page before. The content itself fades in (keyed wrappers below).
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [s.tab]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const plans = ordered.map((g) => ({ g, r: computePlan(planInputsForGoal(s, g)) }));
  const onTrackCount = plans.filter((p) => p.r.onTrack).length;
  const firstOffTrack = plans.find((p) => !p.r.onTrack)?.g;

  const openGoal = (id: string) => {
    actions.setCurrentGoal(id);
    setOpenId(id);
  };
  // The workbench always shows something: the selected goal, else the first.
  const detailGoal = ordered.find((g) => g.id === openId) ?? ordered[0];
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
        <div key="money" className="fade-up">
          <MoneyTab />
        </div>
      </div>
    );
  }

  if (s.tab === "portfolio") {
    return (
      <div className="min-h-screen bg-bg">
        <AppHeader />
        <div key="portfolio" className="fade-up">
          <PortfolioTab />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg">
      <AppHeader />
      <div key="plan" className="fade-up">

      {/* The overview band: night ground carrying the numbers AND the goal
          trajectories, Decade-style. The dark chart is the band's second
          column; on small screens it stacks beneath the stats. */}
      <section className="bg-night">
        <div className="mx-auto grid max-w-page gap-x-10 gap-y-5 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-stretch">
          <div className="flex h-full flex-col">
            <div>
              <span className="text-eyebrow uppercase text-on-night-2">Total saved</span>
              <HeroAmount value={totalCapital(s)} />
              <p className="mt-2 flex items-center gap-2 text-support text-on-night-2">
                {s.goals.length > 0 && (
                  <span
                    aria-hidden
                    className={`live-dot h-1.5 w-1.5 flex-none rounded-full ${
                      onTrackCount === s.goals.length ? "bg-positive" : "bg-cau"
                    }`}
                  />
                )}
                {s.goals.length
                  ? `${onTrackCount} of ${s.goals.length} ${s.goals.length === 1 ? "goal" : "goals"} on track`
                  : "Add a goal to start your plan"}
              </p>
            </div>

            <div className="flex-1" />

            {/* The breakup, inline in the band on a hairline divider. */}
            <dl className="flex flex-wrap items-stretch gap-x-6 gap-y-2 border-t border-on-night-3/40 pt-3">
              {[
                { label: "Cash", text: formatINR(s.currentSavings) },
                { label: "Invested", text: formatINR(holdingsTotal(s)) },
                { label: "Monthly", text: formatINR(s.monthlySip) },
                // Months of expenses the cash covers: the Protect layer as a
                // number, same arithmetic as the advisor note.
                ...(s.monthlyExpenses > 0
                  ? [
                      {
                        label: "Cover",
                        text:
                          s.currentSavings / s.monthlyExpenses >= 12
                            ? "12+ mo"
                            : `${(s.currentSavings / s.monthlyExpenses).toFixed(1)} mo`,
                      },
                    ]
                  : []),
              ].map(({ label, text }) => (
                <div key={label}>
                  <dt className="text-eyebrow uppercase text-on-night-3">{label}</dt>
                  <dd className="num mt-0.5 text-support font-medium text-on-night">{text}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Pill label="Add money" onBand onClick={() => actions.setTab("money")} />
              <AddGoal onAdd={addGoal} onBand />
              {firstOffTrack && (
                <Pill label={`Fix ${firstOffTrack.name.toLowerCase()}`} accent onClick={() => openGoal(firstOffTrack.id)} />
              )}
            </div>
          </div>

          {s.goals.length > 0 && (
            <div className="min-w-0 lg:border-l lg:border-on-night-3/40 lg:pl-10">
              <GoalsChart variant="night" />
            </div>
          )}
        </div>
      </section>

      {/* 88px of bottom padding keeps the sticky copilot clear of the content. */}
      <div className="mx-auto max-w-page px-4 pb-[88px] sm:px-6">
        <div className="flex flex-col gap-4 py-5">
          {s.goals.length === 0 ? (
            <div className={`${card} py-10 text-center`}>
              <p className="text-row font-medium">No goals yet</p>
              <p className="mx-auto mt-1 max-w-xs text-support text-text-2">Add your first goal, or start a fresh plan.</p>
              <button className={`${btnPrimary} mt-4`} onClick={actions.startOnboarding}>
                Start a new plan
              </button>
            </div>
          ) : (
            <>
              {/* Every goal at once: one row of tiles, priority order. */}
              <div className="flex items-center justify-between gap-3">
                <span className={sectionLabel}>Goals · priority order · drag to reorder</span>
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
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4" aria-label="Your goals">
                {ordered.map((g, i) => (
                  <GoalTile
                    key={g.id}
                    g={g}
                    rank={i + 1}
                    selected={detailGoal?.id === g.id}
                    onSelect={() => openGoal(g.id)}
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
              </div>

              {/* The selected goal's workbench, with the portfolio beside it. */}
              <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                <div className="flex min-w-0 flex-col gap-4">
                  <AdvisorNote />
                  {detailGoal && <GoalDetail g={detailGoal} onDelete={() => del(detailGoal)} />}
                </div>
                <PortfolioGlimpse />
              </div>
            </>
          )}
        </div>

        <p className="pb-2 text-center text-caption text-text-2">
          Projections are illustrative and not investment advice.
        </p>
      </div>
      </div>
    </div>
  );
}
