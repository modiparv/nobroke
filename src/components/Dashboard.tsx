import { computePlan } from "../lib/finance";
import { actions, currentGoal, toPlanInputs, useStore } from "../store";
import { btnGhost, card } from "../ui";
import Logo from "./Logo";
import GoalSelector from "./GoalSelector";
import GoalParameters from "./GoalParameters";
import GoalPlanner from "./GoalPlanner";
import PortfolioBuilder from "./PortfolioBuilder";
import Metrics from "./Metrics";
import Insights from "./Insights";
import Aggregation from "./Aggregation";

export default function Dashboard() {
  const s = useStore();
  const goal = currentGoal(s);
  if (!goal) return null;
  const inputs = toPlanInputs(s);
  const result = computePlan(inputs);

  return (
    <div className="min-h-screen pb-24">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-paper/80 px-5 py-4 backdrop-blur sm:px-10">
        <Logo />
        <button className={btnGhost} onClick={actions.startOnboarding}>
          ＋ New plan
        </button>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-8 sm:px-10">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Your money, matched.</h1>
        <p className="mt-1 text-sm text-muted">
          Pick a goal, set the details, then fill your basket — everything recalculates instantly.
        </p>

        <div className="mt-5">
          <GoalSelector />
        </div>

        {/* Goal details + plan summary */}
        <div className="mt-5 grid gap-5 lg:grid-cols-3">
          <section className={card}>
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="text-base font-semibold">Goal details</h2>
              <span className="text-xs text-muted">
                {goal.emoji} {goal.name}
              </span>
            </div>
            <GoalParameters goal={goal} />
          </section>

          <section className={`${card} lg:col-span-2`}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <h2 className="text-base font-semibold">
                Plan for <span className="underline decoration-2 underline-offset-2">{goal.name}</span>
              </h2>

              {/* "What NoBroke sees" — tucked into a hover popover so it stops eating space */}
              <div className="group relative flex-none">
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide text-muted transition hover:border-brand hover:text-ink focus:outline-none focus-visible:border-brand"
                >
                  <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-brand" /> What NoBroke sees
                </button>
                <div className="invisible absolute right-0 top-[calc(100%+8px)] z-30 w-80 max-w-[85vw] translate-y-1 opacity-0 transition duration-150 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100">
                  <div className="rounded-2xl border border-line bg-white p-3 shadow-xl">
                    <Insights r={result} inputs={inputs} />
                  </div>
                </div>
              </div>
            </div>
            <Metrics r={result} goal={goal} inflation={s.inflation} />
          </section>
        </div>

        {/* Goals & money split — target year, priority, per-goal monthly amount */}
        <div className="mt-5">
          <GoalPlanner />
        </div>

        {/* Builder — graph + rebalancing together */}
        <section className={`${card} mt-5`}>
          <PortfolioBuilder />
        </section>

        <section className={`${card} mt-5`}>
          <Aggregation />
        </section>

        <p className="mx-auto mt-8 max-w-2xl text-center text-xs text-muted">
          NoBroke is an early prototype. Projections are illustrative and not investment advice.
        </p>
      </main>
    </div>
  );
}
