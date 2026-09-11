import { mixLabel } from "../lib/portfolios";
import { actions, useStore } from "../store";
import BucketBuilder from "./BucketBuilder";
import MacroStrip from "./MacroStrip";
import PortfolioBuilder from "./PortfolioBuilder";
import PortfolioGlimpse from "./PortfolioGlimpse";

/**
 * The portfolio room, in two views. OVERVIEW: how the portfolio stands
 * today — the read-only glimpse that used to sit on the plan page (the plan
 * is goals-only now, linked here by its strip). BUILD: the live portfolio on
 * the left — presets, the fund universe, sliders, the macro backdrop — and
 * the bucket studio on the right, where a portfolio is curated by hand and
 * applied only when it is ready.
 */
export default function PortfolioTab() {
  const s = useStore();
  const view = s.portfolioView;
  return (
    <div className="mx-auto max-w-6xl px-4 pb-[88px] pt-5 sm:px-6">
      <div className="mb-4 inline-flex items-center gap-0.5 rounded-full bg-surface-2 p-0.5" role="tablist" aria-label="Portfolio views">
        {(["overview", "build"] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={view === v}
            onClick={() => actions.goPortfolio(v)}
            className={`inline-flex h-7 items-center rounded-full px-3 text-support transition ${
              view === v ? "bg-surface font-medium text-text" : "text-text-2 hover:text-text"
            }`}
          >
            {v === "overview" ? "Overview" : "Build"}
          </button>
        ))}
      </div>

      {view === "overview" ? (
        <div className="mx-auto max-w-xl">
          <PortfolioGlimpse />
        </div>
      ) : (
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
      )}
    </div>
  );
}
