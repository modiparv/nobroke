import { formatINR } from "../lib/format";
import { actions, holdingsTotal, totalCapital, useStore } from "../store";
import { paneTop, sectionLabel } from "../ui";
import Aggregation from "./Aggregation";
import Holdings from "./Holdings";
import MoneyInput from "./MoneyInput";

/**
 * The Money tab.
 *
 * Cash in hand and existing investments used to sit at the top of the plan,
 * which put inputs before outcomes and gave the screen a second competing
 * subject. They are facts about the user's balance sheet rather than things a
 * goal-based user manipulates day to day, so they live here (spec section 4).
 */
export default function MoneyTab() {
  const s = useStore();
  const invested = holdingsTotal(s);
  const total = totalCapital(s);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-10 sm:py-8">
      <span className={sectionLabel}>Money</span>
      <h1 className="mt-2 text-[23px] font-medium tracking-[-0.02em]">Your money</h1>
      <p className="mt-1 text-sm text-muted">What you put in each month, and what you already have.</p>

      <section className={`${paneTop} mt-5`}>
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

      <section className={`${paneTop} mt-4`}>
        <Holdings />
        {invested > 0 && (
          <div className="mt-4 flex items-baseline justify-between border-t border-line pt-3">
            <span className="text-[13px] text-muted">Total saved</span>
            <span className="num text-[15px] font-medium">{formatINR(total)}</span>
          </div>
        )}
      </section>

      <section className={`${paneTop} mt-4`}>
        <Aggregation />
      </section>

      <p className="mt-6 text-center text-xs text-muted">
        Projections are illustrative and not investment advice.
      </p>
    </div>
  );
}
