import { useState } from "react";
import { GOALS } from "../lib/goals";
import { bandWeights, allocationTotal, computePlan } from "../lib/finance";
import { formatINR } from "../lib/format";
import { actions, goalsByPriority, planInputsForGoal, totalCapital, useStore } from "../store";
import { btnPrimary, sectionLabel } from "../ui";
import AppHeader from "./AppHeader";
import GoalCard from "./GoalCard";
import MoneyTab from "./MoneyTab";
import PortfolioBuilder from "./PortfolioBuilder";

const inrDigits = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/** Hero figure with the trailing group dimmed, so the eye lands on the magnitude. */
function HeroAmount({ value }: { value: number }) {
  const digits = inrDigits.format(Math.max(0, Math.round(value)));
  const cut = digits.lastIndexOf(",");
  const head = cut >= 0 ? digits.slice(0, cut + 1) : digits;
  const tail = cut >= 0 ? digits.slice(cut + 1) : "";
  return (
    <div className="num mt-2 text-[40px] font-medium leading-none tracking-[-0.025em]">
      ₹{head}
      {tail && <span className="text-muted">{tail}</span>}
    </div>
  );
}

/** Plain-language description of the one shared mix. Never a percentage here. */
function mixLabel(alloc: Record<string, number>): string {
  const total = allocationTotal(alloc);
  if (total <= 0) return "Not invested yet";
  const bands = bandWeights(alloc);
  const equityShare = bands.equity / total;
  if (equityShare >= 0.65) return "Invested in a mostly-stocks mix";
  if (equityShare <= 0.35) return "Invested in a mostly-bonds mix";
  return "Invested in a balanced mix";
}

function Pill({
  label,
  onClick,
  accent,
}: {
  label: string;
  onClick: () => void;
  accent?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3.5 py-2 text-[13px] transition ${
        accent
          ? "bg-brand text-white hover:bg-brand-deep"
          : "border border-line bg-white/70 text-ink hover:border-ink"
      }`}
    >
      {label}
    </button>
  );
}

function AddGoal({ onAdd }: { onAdd: (id: string) => void }) {
  const s = useStore();
  const [open, setOpen] = useState(false);
  const remaining = GOALS.filter((g) => !s.goals.some((x) => x.id === g.id));

  return (
    <span className="relative inline-block">
      <Pill label="New goal" onClick={() => setOpen((o) => !o)} />
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-[calc(100%+8px)] z-20 flex max-h-72 w-60 flex-col overflow-y-auto rounded-2xl border border-line bg-white p-1.5">
            {remaining.length === 0 && <span className="p-3 text-center text-[13px] text-muted">All goals added</span>}
            {remaining.map((g) => (
              <button
                key={g.id}
                onClick={() => {
                  onAdd(g.id);
                  setOpen(false);
                }}
                className="rounded-[10px] px-3 py-2 text-left text-[13px] hover:bg-paper"
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
 * Goals come first because they are the only object the user manipulates. The
 * shared mix is a consequence, so it collapses to a single line and opens on
 * demand. Cash and existing investments moved to the Money tab.
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
      <div className="min-h-screen bg-paper pb-28">
        <AppHeader />
        <MoneyTab />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper pb-28">
      <AppHeader />

      <main className="mx-auto max-w-2xl px-4 py-6 sm:px-10 sm:py-8">
        <span className={sectionLabel}>Total saved</span>
        <HeroAmount value={totalCapital(s)} />
        <p className="mt-2 text-sm text-muted">
          {s.goals.length
            ? `${onTrackCount} of ${s.goals.length} ${s.goals.length === 1 ? "goal" : "goals"} on track · ${formatINR(
                s.monthlySip,
              )} a month going in`
            : "Add a goal to start your plan"}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Pill label="Add money" onClick={() => actions.setTab("money")} />
          <AddGoal onAdd={addGoal} />
          {firstOffTrack && (
            <Pill label={`Fix ${firstOffTrack.name.toLowerCase()}`} accent onClick={() => openGoal(firstOffTrack.id)} />
          )}
        </div>

        {s.goals.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-line bg-white px-5 py-10 text-center">
            <p className="text-[15px] font-medium">No goals yet</p>
            <p className="mx-auto mt-1 max-w-xs text-[13px] text-muted">Add your first goal, or start a fresh plan.</p>
            <button className={`${btnPrimary} mt-4`} onClick={actions.startOnboarding}>
              Start a new plan
            </button>
          </div>
        ) : (
          <ul
            className="mt-6 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white"
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

        {/* The mix is a consequence of the goals, so it stays one line until asked for. */}
        {s.goals.length > 0 && (
          <div className="mt-4 rounded-2xl border border-line bg-white">
            <button
              onClick={() => setShowMix((v) => !v)}
              aria-expanded={showMix}
              className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
            >
              <span className="text-[13px] text-ink">{mixLabel(s.portfolio)}</span>
              <span className="flex-none text-[13px] text-muted">{showMix ? "Hide" : "See how"} ▾</span>
            </button>
            {showMix && (
              <div className="border-t border-line p-4">
                <PortfolioBuilder />
              </div>
            )}
          </div>
        )}

        <p className="mt-8 text-center text-xs text-muted">
          Projections are illustrative and not investment advice.
        </p>
      </main>
    </div>
  );
}
