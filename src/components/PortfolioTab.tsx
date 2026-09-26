import { mixLabel } from "../lib/portfolios";
import { actions, useStore } from "../store";
import BucketBuilder from "./BucketBuilder";
import MacroStrip from "./MacroStrip";
import PortfolioBuilder from "./PortfolioBuilder";

/**
 * The portfolio room: where the portfolio is BUILT. LEFT: the live
 * portfolio (ready-made mixes, the fund search, the weights, the macro
 * backdrop), exactly what the plan runs on today. RIGHT: build your own
 * mix by hand from every option and apply it only when it is ready.
 * READING the portfolio happens on the plan page's glimpse. This room is
 * for hands.
 */
export default function PortfolioTab() {
  const s = useStore();
  return (
    <div className="mx-auto max-w-6xl px-4 pb-[88px] pt-5 sm:px-6">
      {/* Orientation, one line: what this room is for, and the way back to
          where its result shows. */}
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-support text-text-2">
          All your goals are funded from this one mix of funds. Change it here and your goals update.
        </p>
        <button
          type="button"
          onClick={() => actions.setTab("plan")}
          className="text-support font-medium text-text underline underline-offset-2 transition hover:text-text-2"
        >
          See the plan →
        </button>
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <section className="min-w-0 rounded-card border border-line bg-surface">
          <div className="flex items-baseline justify-between gap-3 border-b border-line px-4 py-3">
            <span className="text-support text-text">Your portfolio</span>
            <span className="text-caption text-text-2">{mixLabel(s.portfolio)}</span>
          </div>
          <div className="p-3.5 sm:p-4">
            <PortfolioBuilder />
          </div>
          <MacroStrip />
        </section>

        <BucketBuilder />
      </div>

      <p className="pb-2 pt-5 text-center text-caption text-text-2">
        Projections are illustrative and not investment advice.
      </p>
    </div>
  );
}
