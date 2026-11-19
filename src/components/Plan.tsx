import { useEffect, useState } from "react";
import { goalEstimate } from "../lib/onboarding";
import { GOALS } from "../lib/goals";
import { computePlan } from "../lib/finance";
import { formatINR } from "../lib/format";
import { FOCUS } from "../lib/links";
import { runwayLabel, runwayMonths } from "../lib/runway";
import { actions, goalsByPriority, holdingsTotal, planInputsForGoal, totalCapital, useStore } from "../store";
import { btnPrimary, card } from "../ui";
import { SheetFrame } from "./AddInvestment";
import AdvisorNote from "./AdvisorNote";
import AppHeader from "./AppHeader";
import { GoalDetail, GoalTile } from "./GoalCard";
import GoalsChart from "./GoalsChart";
import MoneyTab from "./MoneyTab";
import PortfolioGlimpse from "./PortfolioGlimpse";
import PortfolioTab from "./PortfolioTab";

const inrDigits = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

const label = "text-support font-medium text-text-2";
const textLink = "text-support font-medium text-text underline underline-offset-2 transition hover:text-text-2";
/** A quiet button on the night band: outlined, never filled. The focus ring
    turns light here, because the page's ink ring would vanish on night. */
const nightGhost =
  "inline-flex h-11 w-full items-center justify-center whitespace-nowrap rounded-control border border-on-night-3 px-4 text-support font-medium text-on-night transition hover:border-on-night hover:bg-on-night/10 focus-visible:outline-on-night sm:w-auto";

/** The band's one big figure, written out in full. */
function HeroAmount({ value }: { value: number }) {
  return (
    <p className="num mt-1 text-[2.25rem] font-medium leading-[1.1] tracking-[-0.025em] text-on-night sm:text-[2.75rem]">
      ₹{inrDigits.format(Math.max(0, Math.round(value)))}
    </p>
  );
}

/** Add a goal: a quiet button on the band that opens the list of goals not
    in the plan yet, each with the amount and date it starts with. */
function AddGoal({ onAdd }: { onAdd: (id: string) => void }) {
  const s = useStore();
  const [open, setOpen] = useState(false);
  const remaining = GOALS.filter((g) => !s.goals.some((x) => x.id === g.id));

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className={nightGhost}>
        New goal
      </button>
      {open && (
        <SheetFrame title="New goal" intro="Each goal starts with the amount and date shown. You can change both." onClose={() => setOpen(false)}>
          {remaining.length === 0 ? (
            <p className="text-body text-text-2">Every goal is already in your plan.</p>
          ) : (
            <ul className="-mt-1 divide-y divide-line border-y border-line">
              {remaining.map((g) => (
                <li key={g.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onAdd(g.id);
                      setOpen(false);
                    }}
                    className="-mx-2 flex min-h-12 w-[calc(100%+1rem)] items-center justify-between gap-3 rounded-control px-2 py-2 text-left transition hover:bg-surface-2"
                  >
                    <span className="min-w-0 text-body font-medium text-text">{g.name}</span>
                    <span className="num flex-none whitespace-nowrap text-support text-text-2">
                      {formatINR(goalEstimate(g, s.profile))} in {g.horizonYears} {g.horizonYears === 1 ? "year" : "years"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </SheetFrame>
      )}
    </>
  );
}

/**
 * The plan screen, master and detail. The night band carries the numbers
 * and every goal's path. Beneath it, every goal is one row of a single
 * list (comparable line by line, draggable to reorder), with the selected
 * goal's full workbench below on the left and the portfolio glimpse beside
 * it on the right. Tapping a row, or a goal in the glimpse, swaps the
 * workbench; nothing ever shoves the list around.
 */
export default function Plan() {
  const s = useStore();
  const ordered = goalsByPriority(s);

  const [openId, setOpenId] = useState<string>(() => s.currentGoalId);

  // The glimpse's "By goal" rows call setCurrentGoal; opening that goal here
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
  // From the band, the goal's workbench is a screen or two below: open it
  // AND go there, so the tap visibly does something.
  const showGoal = (id: string) => {
    openGoal(id);
    actions.setTab("plan", { focus: FOCUS.goalDetail });
  };
  // The workbench always shows something: the selected goal, else the first.
  const detailGoal = ordered.find((g) => g.id === openId) ?? ordered[0];
  const addGoal = (id: string) => {
    actions.addGoal(id);
    showGoal(id);
  };
  const del = (g: { id: string; name: string }) => {
    if (window.confirm(`Delete "${g.name}"? Its money goes to your other goals.`)) {
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

  // The band's small facts, one per line: the words on the left, the
  // figure on the right, so three facts or four line up the same way.
  const facts = [
    { label: "In the bank", text: formatINR(s.currentSavings) },
    { label: "Invested", text: formatINR(holdingsTotal(s)) },
    { label: "Added every month", text: formatINR(s.monthlySip) },
    // Months of expenses the cash would carry, by the same rule as the
    // note and the cash sheet (lib/runway).
    ...(s.monthlyExpenses > 0 ? [{ label: "Cash lasts", text: runwayLabel(runwayMonths(s.currentSavings, s.monthlyExpenses)) }] : []),
  ];

  return (
    <div className="min-h-screen bg-bg">
      <AppHeader />
      <div key="plan" className="fade-up">
        {/* The overview band: night ground carrying the numbers AND the
            goals' paths. The chart is the band's second column; on small
            screens it stacks beneath the numbers. */}
        <section className="bg-night">
          <div className="mx-auto grid max-w-page gap-x-10 gap-y-7 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-stretch">
            <div className="flex h-full flex-col">
              <div>
                <p className="text-support text-on-night-2">Saved so far</p>
                <HeroAmount value={totalCapital(s)} />
                <p className="num mt-2 text-body text-on-night">
                  {s.goals.length
                    ? `${onTrackCount} of ${s.goals.length} ${s.goals.length === 1 ? "goal" : "goals"} on track`
                    : "Add a goal to start your plan"}
                </p>
              </div>

              <div className="min-h-5 flex-1" />

              <dl className="divide-y divide-on-night-3/30 border-y border-on-night-3/30 sm:max-w-md lg:max-w-none">
                {facts.map(({ label: name, text }) => (
                  <div key={name} className="flex items-baseline justify-between gap-4 py-2">
                    <dt className="text-support text-on-night-2">{name}</dt>
                    <dd className="num whitespace-nowrap text-row font-medium text-on-night">{text}</dd>
                  </div>
                ))}
              </dl>

              {/* One main button: fix the first goal that is short. Adding
                  money and adding a goal stay quiet beside it. */}
              <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                {firstOffTrack && (
                  <button
                    type="button"
                    onClick={() => showGoal(firstOffTrack.id)}
                    className={`${btnPrimary} w-full focus-visible:outline-on-night sm:w-auto`}
                  >
                    Fix {firstOffTrack.name.toLowerCase()}
                  </button>
                )}
                <div className="grid grid-cols-2 gap-2 sm:flex">
                  <button type="button" onClick={() => actions.openSheet({ kind: "add_money" })} className={nightGhost}>
                    Add money
                  </button>
                  <AddGoal onAdd={addGoal} />
                </div>
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
          <div className="flex flex-col gap-5 py-6">
            {s.goals.length === 0 ? (
              <div className={`${card} py-10 text-center`}>
                <h2 className="text-section font-medium text-text">No goals yet</h2>
                <p className="mx-auto mt-1 max-w-xs text-support text-text-2">Add one with New goal above, or start a fresh plan.</p>
                <button type="button" className={`${btnPrimary} mt-4`} onClick={actions.startOnboarding}>
                  Start a new plan
                </button>
              </div>
            ) : (
              <>
                {/* Every goal at once: one list, one row per goal, in priority
                    order. A row is as wide as the list, so no goal is left
                    on its own in a half-empty grid. */}
                <section>
                  <h2 className={label}>Your goals, most urgent first</h2>
                  <div className="mt-2 overflow-hidden rounded-card border border-line bg-surface">
                    <ol className="divide-y divide-line" aria-label="Your goals">
                      {ordered.map((g, i) => (
                        <li key={g.id}>
                          <GoalTile
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
                        </li>
                      ))}
                    </ol>
                    {s.goals.length > 1 && (
                      <div className="flex flex-wrap items-center justify-between gap-x-4 border-t border-line px-3 sm:px-4">
                        <p className="text-pretty py-2.5 text-support text-text-2">
                          Saved money covers these goals in order, top first.
                          <span className="hidden md:inline"> Drag a goal to move it.</span>
                        </p>
                        <button type="button" onClick={actions.recommendGoalSplit} className={`${textLink} inline-flex h-11 items-center whitespace-nowrap`}>
                          Split my money for me
                        </button>
                      </div>
                    )}
                  </div>
                </section>

                {/* The selected goal's workbench, with the portfolio beside it. */}
                <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                  <div className="flex min-w-0 flex-col gap-4">
                    <AdvisorNote />
                    {detailGoal && <GoalDetail g={detailGoal} onDelete={() => del(detailGoal)} />}
                  </div>
                  <PortfolioGlimpse />
                </div>
              </>
            )}
          </div>

          {/* On a phone, someone without an account has no other control to start over. */}
          {!s.user && (
            <p className="text-center sm:hidden">
              <button
                type="button"
                onClick={actions.startOnboarding}
                className="inline-flex min-h-11 items-center text-support font-medium text-text underline underline-offset-2 hover:text-text-2"
              >
                Start a new plan
              </button>
            </p>
          )}
          <p className="pb-2 text-center text-support text-text-2">Projections are illustrative and not investment advice.</p>
        </div>
      </div>
    </div>
  );
}
