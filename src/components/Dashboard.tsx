import { computePlan } from "../lib/finance";
import { actions, currentGoal, toPlanInputs, useStore } from "../store";
import { btnGhost, card, sectionLabel } from "../ui";
import GoalSelector from "./GoalSelector";
import GoalParameters from "./GoalParameters";
import PortfolioBuilder from "./PortfolioBuilder";
import Metrics from "./Metrics";
import Chart from "./Chart";
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
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-white/80 px-5 py-4 backdrop-blur sm:px-10">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-deep text-sm font-semibold text-white">N</span>
          <span className="text-lg font-semibold tracking-tight">NoBroke</span>
        </div>
        <button className={btnGhost} onClick={actions.startOnboarding}>
          ＋ New plan
        </button>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-8 sm:px-10">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Your money, matched.</h1>
        <p className="mt-1 text-sm text-muted">
          Switch goals, fill your basket, and ask NoBroke AI anything — everything recalculates instantly.
        </p>

        <div className="mt-5">
          <GoalSelector />
        </div>

        <section className={`${card} mt-5`}>
          <PortfolioBuilder />
        </section>

        <div className="mt-5 grid gap-5 lg:grid-cols-3">
          <section className={card}>
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="text-base font-medium">Goal details</h2>
              <span className="text-xs text-muted">{goal.emoji} {goal.name}</span>
            </div>
            <GoalParameters goal={goal} />
          </section>

          <section className={`${card} lg:col-span-2`}>
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="text-base font-medium">
                Plan for <span className="text-brand-deep underline decoration-2 underline-offset-2">{goal.name}</span>
              </h2>
              <span className="text-xs text-muted">Live</span>
            </div>
            <Metrics r={result} goal={goal} inflation={s.inflation} />
            <Chart r={result} />
            <div className="mt-5 border-t border-line pt-4">
              <span className={sectionLabel}>What NoBroke sees</span>
              <div className="mt-2">
                <Insights r={result} inputs={inputs} />
              </div>
            </div>
          </section>
        </div>

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
