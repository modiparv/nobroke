import { useState } from "react";
import { GOALS } from "../lib/goals";
import { computePlan } from "../lib/finance";
import { formatINR } from "../lib/format";
import { actions, goalMonthly, goalsByPriority, holdingsTotal, planInputsForGoal, totalCapital, useStore } from "../store";
import { btnPrimary, card, sectionLabel } from "../ui";
import AppHeader from "./AppHeader";
import Aggregation from "./Aggregation";
import GoalCard from "./GoalCard";
import Holdings from "./Holdings";
import MoneyInput from "./MoneyInput";
import PortfolioBuilder from "./PortfolioBuilder";

/** Distinct swatches for the cross-goal split bar/legend. */
const SPLIT_COLORS = ["#6750F2", "#16C098", "#E0A23C", "#15161B", "#9B8CFF", "#8A8D98"];

function AddGoal({ onAdd }: { onAdd: (id: string) => void }) {
  const s = useStore();
  const [open, setOpen] = useState(false);
  const remaining = GOALS.filter((g) => !s.goals.some((x) => x.id === g.id));

  return (
    <div className="relative flex-none">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-line px-4 py-2 text-sm font-medium text-muted transition hover:border-brand hover:text-ink"
      >
        ＋ Add a goal
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-[calc(100%+8px)] z-20 flex max-h-72 w-60 flex-col gap-0.5 overflow-y-auto rounded-2xl border border-line bg-white p-2 shadow-xl">
            {remaining.length === 0 && <span className="p-3 text-center text-sm text-muted">All goals added 🎉</span>}
            {remaining.map((g) => (
              <button
                key={g.id}
                onClick={() => {
                  onAdd(g.id);
                  setOpen(false);
                }}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium hover:bg-paper"
              >
                <span>{g.emoji}</span>
                {g.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * One screen for the whole plan. The money inputs live up top, then every goal
 * is a card you open in place to reveal its plan AND its portfolio — replacing
 * the old two-tab Goals / Portfolio split where one goal lived on two screens.
 */
export default function Plan() {
  const s = useStore();
  const ordered = goalsByPriority(s);

  // The open goal is the one whose plan + portfolio is expanded. Keeping it in
  // sync with currentGoalId means the embedded PortfolioBuilder always edits the
  // goal the user is looking at.
  const [openId, setOpenId] = useState<string>(() => s.currentGoalId);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const onTrackCount = ordered.filter((g) => computePlan(planInputsForGoal(s, g)).onTrack).length;
  const invested = holdingsTotal(s);
  const total = totalCapital(s);

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
    if (window.confirm(`Delete "${g.name}"? Its money will be reshared across the other goals.`)) {
      actions.removeGoal(g.id);
      setOpenId("");
    }
  };

  return (
    <div className="min-h-screen pb-28">
      <AppHeader />

      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-10 sm:py-8">
        <h1 className="text-3xl font-extrabold uppercase leading-[0.88] tracking-[-0.045em] sm:text-5xl">
          Your money plan
        </h1>
        <p className="mt-3 max-w-xl text-sm text-muted">
          {s.goals.length
            ? `${onTrackCount} of ${s.goals.length} ${s.goals.length === 1 ? "goal" : "goals"} on track · splitting ${formatINR(
                s.monthlySip,
              )}/mo. Open a goal to set it up and build its portfolio.`
            : "Add a goal to start your plan."}
        </p>

        {/* Your money — the pool everything is split from */}
        <section className={`${card} mt-6`}>
          <div className="flex items-center justify-between gap-2">
            <span className={sectionLabel}>Your money</span>
            <span className="font-mono text-[10px] uppercase tracking-wide text-muted">
              working toward goals <span className="font-semibold text-ink">{formatINR(total)}</span>
            </span>
          </div>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <MoneyInput label="Invest / month" value={s.monthlySip} onChange={actions.setSip} step={1000} min={0} max={1000000} compact />
            <MoneyInput label="Cash in hand / bank" value={s.currentSavings} onChange={actions.setSavings} step={25000} min={0} max={50000000} compact />
          </div>
          <p className="mt-2 text-[11px] text-muted">
            = {formatINR(s.currentSavings)} cash + {formatINR(invested)} in existing investments, growing toward every goal.
          </p>
          <div className="mt-4 border-t border-line pt-4">
            <Holdings />
          </div>

          {/* Cross-goal split — one place to see (and auto-balance) how the pool divides */}
          {s.goals.length > 1 && (
            <div className="mt-5 border-t border-line pt-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className={sectionLabel}>How your {formatINR(s.monthlySip)}/mo is split</span>
                <button
                  onClick={actions.recommendGoalSplit}
                  className="rounded-full border border-line px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide text-muted transition hover:border-brand hover:text-ink"
                >
                  ✨ Auto-balance
                </button>
              </div>
              <div className="mt-2.5 flex h-3 w-full overflow-hidden rounded-full bg-line">
                {ordered.map((g, i) => {
                  const share = s.monthlySip > 0 ? (goalMonthly(s, g.id) / s.monthlySip) * 100 : 0;
                  return (
                    <div
                      key={g.id}
                      className="h-full transition-[width] duration-500 ease-out"
                      style={{ width: `${share}%`, background: SPLIT_COLORS[i % SPLIT_COLORS.length] }}
                    />
                  );
                })}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] uppercase tracking-wide text-muted">
                {ordered.map((g, i) => {
                  const share = s.monthlySip > 0 ? (goalMonthly(s, g.id) / s.monthlySip) * 100 : 0;
                  return (
                    <span key={g.id} className="inline-flex items-center gap-1.5">
                      <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: SPLIT_COLORS[i % SPLIT_COLORS.length] }} />
                      {g.emoji} {g.name} {Math.round(share)}%
                    </span>
                  );
                })}
              </div>
            </div>
          )}

        </section>

        {/* One shared portfolio — funds every goal (no per-goal baskets) */}
        {s.goals.length > 0 && (
          <section className={`${card} mt-5`}>
            <PortfolioBuilder />
          </section>
        )}

        {/* Goals — each opens in place to reveal its plan + how it's tracking */}
        <div className="mt-8 flex items-center justify-between gap-3">
          <h2 className="text-base font-bold">Your goals</h2>
          <AddGoal onAdd={addGoal} />
        </div>
        <p className="mt-1 text-[13px] text-muted">
          Each goal draws its share of the money above and grows in your one portfolio. Tap a goal to set its target and see if
          it's on track.
          {s.goals.length > 1 && (
            <>
              {" "}
              Drag <span aria-hidden>⠿</span> to set priority.
            </>
          )}
        </p>

        {s.goals.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-line bg-paper px-5 py-10 text-center">
            <p className="text-sm font-semibold">No goals yet</p>
            <p className="mx-auto mt-1 max-w-xs text-[13px] text-muted">Add your first goal above, or start a fresh plan.</p>
            <button className={`${btnPrimary} mt-4`} onClick={actions.startOnboarding}>
              Start a new plan
            </button>
          </div>
        ) : (
          <ul className="mt-4 flex flex-col gap-3" aria-label="Your goals">
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

        {/* Account aggregation scaffold — global, lives once at the bottom */}
        <section className={`${card} mt-8`}>
          <Aggregation />
        </section>

        <p className="mx-auto mt-8 max-w-2xl text-center text-xs text-muted">
          NoBroke is an early prototype. Projections are illustrative and not investment advice.
        </p>
      </main>
    </div>
  );
}
