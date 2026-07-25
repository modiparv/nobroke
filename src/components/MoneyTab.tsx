import { formatINR } from "../lib/format";
import { actions, holdingsTotal, totalCapital, useStore } from "../store";
import { card, sectionLabel } from "../ui";
import Aggregation from "./Aggregation";
import Holdings from "./Holdings";
import MoneyInput from "./MoneyInput";

/**
 * The Money tab.
 *
 * Cash in hand and existing investments used to sit at the top of the plan,
 * which put inputs before outcomes and gave the screen a second competing
 * subject. They are facts about the balance sheet rather than things a
 * goal-based user manipulates day to day, so they live here (spec section 4).
 */
export default function MoneyTab() {
  const s = useStore();
  const invested = holdingsTotal(s);

  return (
    <div className="mx-auto max-w-page px-4 pb-[88px] sm:px-6">
      <section className="border-b border-line py-6 sm:py-8">
        <span className={sectionLabel}>Money</span>
        <h1 className="mt-1.5 text-headline font-medium">Your money</h1>
        <p className="mt-1 text-body text-text-2">What you put in each month, and what you already have.</p>
      </section>

      <div className="grid gap-4 py-6 lg:grid-cols-[1.55fr_1fr] lg:gap-6">
        <div className="flex flex-col gap-4">
          <section className={card}>
            <MoneyInput
              label="Invest each month"
              value={s.monthlySip}
              onChange={actions.setSip}
              step={1000}
              min={0}
              max={1000000}
            />
            <div className="mt-5 border-t border-line pt-5">
              <MoneyInput
                label="Cash in hand or bank"
                value={s.currentSavings}
                onChange={actions.setSavings}
                step={25000}
                min={0}
                max={50000000}
              />
            </div>
          </section>

          <section className={card}>
            <Holdings />
          </section>
        </div>

        <aside className="flex flex-col gap-4">
          <div className={card}>
            <span className={sectionLabel}>Total saved</span>
            <div className="num mt-1.5 text-headline font-medium">{formatINR(totalCapital(s))}</div>
            <dl className="mt-3 flex flex-col gap-2 border-t border-line pt-3">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-support text-text-2">Cash</dt>
                <dd className="num text-support">{formatINR(s.currentSavings)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-support text-text-2">Already invested</dt>
                <dd className="num text-support">{formatINR(invested)}</dd>
              </div>
            </dl>
          </div>

          <div className={card}>
            <Aggregation />
          </div>
        </aside>
      </div>

      <p className="pb-2 text-center text-caption text-text-3">
        Projections are illustrative and not investment advice.
      </p>
    </div>
  );
}
