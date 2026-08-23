import { mixLabel } from "../lib/portfolios";
import { useStore } from "../store";
import BucketBuilder from "./BucketBuilder";
import MacroStrip from "./MacroStrip";
import PortfolioBuilder from "./PortfolioBuilder";

/**
 * The portfolio room, in two halves. LEFT: the live mix — presets, the fund
 * universe, sliders, the macro backdrop — exactly what the plan runs on
 * today. RIGHT: the bucket studio, where a mix is curated by hand from the
 * whole instrument pool and applied only when it is ready. Draft on the
 * right, live on the left.
 */
export default function PortfolioTab() {
  const s = useStore();
  return (
    <div className="mx-auto max-w-6xl px-4 pb-[88px] pt-5 sm:px-6">
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <section className="min-w-0 rounded-card border border-line bg-surface">
          <div className="flex items-baseline justify-between gap-3 border-b border-line px-4 py-3">
            <span className="text-support text-text">The live mix</span>
            <span className="text-caption text-text-2">{mixLabel(s.portfolio)}</span>
          </div>
          <div className="p-3.5 sm:p-4">
            <PortfolioBuilder />
          </div>
          <MacroStrip />
        </section>

        <BucketBuilder />
      </div>
    </div>
  );
}
