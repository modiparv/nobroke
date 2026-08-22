import { mixLabel } from "../lib/portfolios";
import { useStore } from "../store";
import MacroStrip from "./MacroStrip";
import PortfolioBuilder from "./PortfolioBuilder";

/**
 * The portfolio room: everything about BUILDING the one shared mix lives
 * here — presets, the live fund universe, sliders, nudges — with the macro
 * numbers in the footer, since they are the assumptions' backdrop. The plan
 * page only glances at the result.
 */
export default function PortfolioTab() {
  const s = useStore();
  return (
    <div className="mx-auto max-w-3xl px-4 pb-[88px] pt-5 sm:px-6">
      <section className="min-w-0 rounded-card border border-line bg-surface">
        <div className="border-b border-line px-4 py-3">
          <span className="text-support text-text">{mixLabel(s.portfolio)}</span>
        </div>
        <div className="p-3.5 sm:p-4">
          <PortfolioBuilder />
        </div>
        <MacroStrip />
      </section>
    </div>
  );
}
