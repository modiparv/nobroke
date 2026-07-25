import { useState } from "react";
import { GOALS } from "../lib/goals";
import { allocationTotal, bandWeights, computePlan } from "../lib/finance";
import { formatINR } from "../lib/format";
import { actions, goalsByPriority, holdingsTotal, planInputsForGoal, totalCapital, useStore } from "../store";
import { btnPrimary, card, sectionLabel } from "../ui";
import AppHeader from "./AppHeader";
import GoalCard from "./GoalCard";
import MoneyTab from "./MoneyTab";
import PortfolioBuilder from "./PortfolioBuilder";

const inrDigits = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/**
 * Hero figure. The trailing group is dimmed only when it carries information:
 * a faded run of zeros reads as a rendering fault, not as emphasis (spec 8).
 */
function HeroAmount({ value }: { value: number }) {
  const digits = inrDigits.format(Math.max(0, Math.round(value)));
  const cut = digits.lastIndexOf(",");
  const head = cut >= 0 ? digits.slice(0, cut + 1) : digits;
  const tail = cut >= 0 ? digits.slice(cut + 1) : "";
  const dim = tail !== "" && !/^0+$/.test(tail);

  return (
    <div className="num mt-1.5 text-hero font-medium text-on-band">
      ₹{dim ? head : digits}
      {dim && <span className="text-on-band-3">{tail}</span>}
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
    ? "bg-accent text-on-accent hover:bg-accent-hi"
    : onBand
      ? "border border-on-band/30 text-on-band hover:border-on-band/60"
      : "border border-line text-text hover:border-line-2";
  return (
    <button onClick={onClick} className={`rounded-full px-3.5 py-2 text-support transition ${tone}`}>
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
          <div className="absolute left-0 top-[calc(100%+8px)] z-20 flex max-h-72 w-60 flex-col overflow-y-auto rounded-card border border-line bg-surface p-1.5">
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
 * Two columns on desktop: goals on the left because they are the only object
 * the user manipulates, and their consequences (the mix, the contribution
 * summary) in the right rail. Below 1024px the rail drops beneath the goals.
 */
export default function Plan() {
  const s = useStore();
  const ordered = goalsByPriority(s);

  const [openId, setOpenId] = useState<string>(() => s.currentGoalId);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [showMix, setShowMix] = useState(false);

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

      {/* The one dark surface on this screen: a full-bleed ink band carrying
          the total-saved figure (spec section 4). Everything below is white
          cards on the pale page. */}
      <section className="bg-band">
        <div className="mx-auto flex max-w-page flex-col gap-5 px-4 py-7 sm:flex-row sm:items-end sm:justify-between sm:px-6 sm:py-9">
          <div>
            <span className="text-eyebrow uppercase text-on-band-2">Total saved</span>
            <HeroAmount value={totalCapital(s)} />
            <p className="mt-2 text-body text-on-band-2">
              {s.goals.length
                ? `${onTrackCount} of ${s.goals.length} ${s.goals.length === 1 ? "goal" : "goals"} on track · ${formatINR(
                    s.monthlySip,
                  )} a month going in`
                : "Add a goal to start your plan"}
            </p>
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
        <div className="grid gap-4 py-6 lg:grid-cols-[1.55fr_1fr] lg:gap-6">
          <div>
            {s.goals.length === 0 ? (
              <div className={`${card} py-10 text-center`}>
                <p className="text-row font-medium">No goals yet</p>
                <p className="mx-auto mt-1 max-w-xs text-support text-text-2">Add your first goal, or start a fresh plan.</p>
                <button className={`${btnPrimary} mt-4`} onClick={actions.startOnboarding}>
                  Start a new plan
                </button>
              </div>
            ) : (
              <ul
                className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface"
                aria-label="Your goals"
              >
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
            )}
          </div>

          {/* Right rail: the consequences of the goals, not more inputs. */}
          <aside className="flex flex-col gap-4">
            {s.goals.length > 0 && (
              <div className="rounded-card border border-line bg-surface">
                <button
                  onClick={() => setShowMix((v) => !v)}
                  aria-expanded={showMix}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
                >
                  <span className="text-support text-text">{mixLabel(s.portfolio)}</span>
                  <span className="flex-none text-support text-text-2">{showMix ? "Hide" : "See how"} ▾</span>
                </button>
                {showMix && (
                  <div className="border-t border-line p-4">
                    <PortfolioBuilder />
                  </div>
                )}
              </div>
            )}

            <div className={card}>
              <span className={sectionLabel}>Saved per month</span>
              <div className="num mt-1.5 text-headline font-medium">{formatINR(s.monthlySip)}</div>
              <dl className="mt-3 flex flex-col gap-2 border-t border-line pt-3">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-support text-text-2">Cash</dt>
                  <dd className="num text-support">{formatINR(s.currentSavings)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-support text-text-2">Already invested</dt>
                  <dd className="num text-support">{formatINR(holdingsTotal(s))}</dd>
                </div>
              </dl>
              <p className="mt-3 text-caption text-text-3">
                Month-by-month history appears once contributions are recorded.
              </p>
            </div>
          </aside>
        </div>

        <p className="pb-2 text-center text-caption text-text-3">
          Projections are illustrative and not investment advice.
        </p>
      </div>
    </div>
  );
}
