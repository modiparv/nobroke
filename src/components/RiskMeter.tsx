import { riskBandIndex, riskBandLabel } from "../lib/risk";
import { actions, useStore } from "../store";

/**
 * The risk appetite dial: five segments from Conservative to Aggressive with
 * the person's position marked. Assessed from the intake, slidable by hand
 * (a real range input drives it, so keyboard and screen readers work), and
 * every mix recommendation respects it as a ceiling.
 *
 * The gauge colours are fixed semantics (calm green to hot red), not theme
 * tones: risk reads the same in both palettes.
 */
const SEGMENTS = ["#0E7A5A", "#63A355", "#D9A406", "#D96830", "#B3261E"];

export default function RiskMeter() {
  const s = useStore();
  const v = s.riskAppetite;
  const active = riskBandIndex(v);

  return (
    <div className="mb-3 rounded-control bg-surface-2 px-3 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-eyebrow uppercase text-text-3">Risk appetite</span>
        <span className="text-support font-medium">{riskBandLabel(v)}</span>
      </div>

      <div className="relative mt-2.5 pb-3">
        <div className="flex h-2.5 gap-1" aria-hidden>
          {SEGMENTS.map((c, i) => (
            <div
              key={c}
              className="flex-1 rounded-full transition-opacity"
              style={{ background: c, opacity: i === active ? 1 : 0.35 }}
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
      </div>

      <p className="mt-1 text-caption text-text-3">
        {s.riskAppetiteSource === "assessed"
          ? "Assessed from your income, cover, dependants and timelines. Slide it if it feels wrong."
          : "Set by you. Recommendations stay within it."}
      </p>
    </div>
  );
}
