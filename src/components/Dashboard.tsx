import { computePlan } from "../lib/finance";
import { actions, currentGoal, toPlanInputs, useStore } from "../store";
import { card } from "../ui";
import AppHeader from "./AppHeader";
import Arrow from "./Arrow";
import GoalSelector from "./GoalSelector";
import PortfolioBuilder from "./PortfolioBuilder";
import Metrics from "./Metrics";
import Insights from "./Insights";
import Aggregation from "./Aggregation";

export default function Dashboard() {
  const s = useStore();
  const goal = currentGoal(s);
  if (!goal) {
    return (
      <div className="min-h-screen pb-24">
        <AppHeader />
        <main className="mx-auto max-w-2xl px-5 py-20 text-center sm:px-10">
          <h1 className="text-3xl font-extrabold uppercase leading-[0.88] tracking-[-0.045em] sm:text-5xl">No goals yet</h1>
          <p className="mx-auto mt-4 max-w-sm text-sm text-muted">Add a goal on the Goals tab and the plan + portfolio will appear here.</p>
          <button onClick={actions.goGoals} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-ink px-5 py-3 text-sm font-semibold text-white hover:bg-[#262626]">
            Go to Goals <Arrow />
          </button>
        </main>
      </div>
    );
  }
  const inputs = toPlanInputs(s);
  const result = computePlan(inputs);

  return (
    <div className="min-h-screen pb-24">
      <AppHeader />

      <main className="mx-auto max-w-6xl px-5 py-8 sm:px-10">
        <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.15em] text-muted">
          <span aria-hidden className="inline-block h-1.5 w-1.5 bg-brand" /> Step 2 of 2 · build it
        </span>
        <h1 className="mt-3 text-3xl font-extrabold uppercase leading-[0.88] tracking-[-0.045em] sm:text-5xl">Your portfolio</h1>
        <p className="mt-3 text-sm text-muted">
          Pick a goal to see its plan, then build its portfolio.{" "}
          <button onClick={actions.goGoals} className="inline-flex items-center gap-1 font-semibold text-ink underline decoration-line underline-offset-2 hover:decoration-ink">
            Manage goals <Arrow />
          </button>
        </p>

        <div className="mt-5">
          <GoalSelector />
        </div>

        {/* Plan summary for the selected goal */}
        <section className={`${card} mt-5`}>
          <div className="mb-4 flex items-start justify-between gap-3">
            <h2 className="text-base font-semibold">
              Plan for <span className="underline decoration-2 underline-offset-2">{goal.name}</span>
            </h2>
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
