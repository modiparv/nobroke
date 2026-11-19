import { RISK_BANDS, riskBandIndex, riskBandLabel } from "../lib/risk";
import { actions, useStore } from "../store";
import { card } from "../ui";

/**
 * The risk level: five steps from Conservative to Aggressive with the
 * person's position marked by a knob and named in a word. Worked out from
 * the intake, slidable by hand (a real range input drives it, so keyboard
 * and screen readers work), and the starting mix stays within it.
 *
 * The familiar green-to-red arc, filled up to the selection: calm at one
 * end, bold at the other, the reading every Indian investor already knows.
 * The colours only repeat what the knob and the word already say, so the
 * meter still reads in greyscale.
 */
const RAMP = ["var(--risk-1)", "var(--risk-2)", "var(--risk-3)", "var(--risk-4)", "var(--risk-5)"];
const UNFILLED = "var(--risk-unfilled)";
/** The knob's width in px. It travels the track inset by half of this, the
    way a native range thumb does, so it never hangs off either end. */
const KNOB = 24;

export default function RiskMeter({ className = "" }: { className?: string }) {
  const s = useStore();
  const v = s.riskAppetite;
  const active = riskBandIndex(v);

  // How the level was set, and what moving it does, in plain sight: a
  // tooltip never shows on a phone.
  const source =
    s.riskAppetiteSource === "assessed"
      ? "Worked out from your income, how long your cash lasts, who depends on you and your goal dates. Slide it if it feels wrong."
      : "Set by you.";
  const follows = !s.portfolioCustom && s.goals.length > 0 ? " Until you pick a mix yourself, your mix stays within this level." : "";

  return (
    <section className={`${card} min-w-0 ${className}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 className="text-section font-medium text-text">Your risk level</h2>
        <span className="text-row font-medium text-text">{riskBandLabel(v)}</span>
      </div>

      {/* A full 44px row to slide in. The range input is the control; the
          segments and the knob are its picture. */}
      <div className="relative mt-1 flex h-11 items-center">
        <div className="flex h-3 w-full gap-1" aria-hidden>
          {RAMP.map((c, i) => (
            <div
              key={c}
              className="flex-1 rounded-full transition-colors motion-reduce:transition-none"
              style={{ background: i <= active ? c : UNFILLED }}
            />
          ))}
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={v}
          onChange={(e) => actions.setRiskAppetite(Number(e.target.value))}
          aria-label="Your risk level"
          aria-valuetext={`${riskBandLabel(v)}, level ${active + 1} of ${RISK_BANDS.length}`}
          className="peer absolute inset-0 m-0 w-full cursor-pointer opacity-0"
          // The page's base style sets every range input to 4px tall.
          style={{ height: "100%" }}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-text bg-surface peer-focus-visible:ring-2 peer-focus-visible:ring-text peer-focus-visible:ring-offset-2"
          style={{ width: KNOB, height: KNOB, left: `calc(${KNOB / 2}px + (100% - ${KNOB}px) * ${v / 100})` }}
        />
      </div>
      <div className="flex justify-between gap-3 text-support text-text-2">
        <span>{RISK_BANDS[0]}</span>
        <span>{RISK_BANDS[RISK_BANDS.length - 1]}</span>
      </div>

      <p className="mt-3 text-pretty text-support text-text-2">
        {source}
        {follows}
      </p>
    </section>
  );
}
