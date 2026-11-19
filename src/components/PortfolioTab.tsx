import { actions } from "../store";
import BucketBuilder from "./BucketBuilder";
import PortfolioBuilder from "./PortfolioBuilder";

/**
 * The Portfolio tab: the one mix every goal is funded from. It opens on
 * the mix itself, then what the mix holds (with the search that adds one
 * more fund) and the ways to change it (the risk level and the three
 * ready-made mixes), and ends with the advanced corner for building a mix
 * by hand. One grid lays all of it out: a single column on a phone, two
 * from the lg breakpoint up, with the column widths the Money tab uses.
 */
export default function PortfolioTab() {
  return (
    <div className="mx-auto max-w-page px-4 pb-[88px] sm:px-6">
      {/* Orientation, one line: what this page is for, and the way back to
          where its result shows. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 pt-3">
        <p className="text-pretty text-support text-text-2">
          All your goals are funded from this one mix of funds. Change it here and your goals update.
        </p>
        <button
          type="button"
          onClick={() => actions.setTab("plan")}
          className="inline-flex min-h-11 items-center text-support font-medium text-text underline underline-offset-2 transition hover:text-text-2"
        >
          See your goals
        </button>
      </div>

      <div className="grid gap-4 pb-4 pt-2 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:gap-6">
        <PortfolioBuilder />
        <BucketBuilder className="order-6 lg:col-span-2" />
      </div>

      <p className="text-balance pb-2 pt-1 text-center text-support text-text-2">
        Projections are illustrative and not investment advice.
      </p>
    </div>
  );
}
