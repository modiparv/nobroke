import { riskBandIndex, riskBandLabel } from "../lib/risk";
import { actions, useStore } from "../store";

/**
 * The risk appetite dial: five segments from Conservative to Aggressive with
 * the person's position marked. Assessed from the intake, slidable by hand
 * (a real range input drives it, so keyboard and screen readers work), and
 * every mix recommendation respects it as a ceiling.
 *
 * The familiar green-to-red arc, filled up to the selection: calm at one
 * end, bold at the other, the reading every Indian investor already knows.
 * The steps resolve through theme tokens, so light and dark each get their
 * own ramp.
 */
const RAMP = ["var(--risk-1)", "var(--risk-2)", "var(--risk-3)", "var(--risk-4)", "var(--risk-5)"];
const UNFILLED = "var(--risk-unfilled)";

/** readOnly: the literal meter without the slider — for the plan page's
 *  glimpse, where risk is shown but only the Portfolio tab may change it. */
export default function RiskMeter({ readOnly = false }: { readOnly?: boolean }) {
  const s = useStore();
  const v = s.riskAppetite;
  const active = riskBandIndex(v);

  return (
    <div
      className="mb-3 rounded-control bg-surface-2 px-3 py-2"
      title={
        readOnly
          ? "Your risk level. Change it on the Portfolio tab."
          : s.riskAppetiteSource === "assessed"
            ? "Assessed from your income, cover, dependants and timelines. Slide it if it feels wrong."
            : "Set by you. Recommendations stay within it."
      }
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-eyebrow uppercase text-text-3">Risk appetite</span>
        <span className="text-support font-medium">{riskBandLabel(v)}</span>
      </div>

      <div className="relative mt-2.5 pb-3">
        <div className="flex h-2.5 gap-1" aria-hidden>
          {RAMP.map((c, i) => (
            <div
              key={c}
              className="flex-1 rounded-full transition-colors"
              style={{ background: i <= active ? c : UNFILLED }}
            />
          ))}
        </div>
        <span
          aria-hidden
          className="absolute top-3 text-[9px] leading-none text-text"
          style={{ left: `${v}%`, transform: "translateX(-50%)" }}
        >
          ▲
        </span>
        {!readOnly && (
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={v}
            onChange={(e) => actions.setRiskAppetite(Number(e.target.value))}
            aria-label="Risk appetite"
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        )}
      </div>

    </div>
  );
}
