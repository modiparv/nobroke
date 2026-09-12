import { STAGES, stageFor } from "../lib/climb";
import { formatINR } from "../lib/format";
import { appetiteCeiling } from "../lib/risk";
import { actions, monthlyForCoverage, planCoverage, useStore } from "../store";

/**
 * The avatar: a professional bust in a ring. The ring fills with how much
 * of the whole plan today's pace covers; the five-step rank and the stage
 * name (Base camp to Summit — the climb up Meru, kept in words) say where
 * that puts you; the tie takes the colour of your risk appetite. The one
 * nudge under it is computed, not motivational filler: the smallest extra
 * monthly that reaches the next stage, or a fifth more and the exact gain.
 */
const R = 33;
const CIRC = 2 * Math.PI * R;

const APPETITE_TONE = {
  steady: { color: "var(--chartn-2)", label: "Steady" },
  balanced: { color: "var(--chartn-1)", label: "Balanced" },
  bold: { color: "var(--chartn-3)", label: "Bold" },
} as const;

export default function Climb() {
  const s = useStore();
  if (s.goals.length === 0) return null;
  const coverage = planCoverage(s);
  const { stage, index, next } = stageFor(coverage);
  const tone = APPETITE_TONE[appetiteCeiling(s.riskAppetite)];
  const pctText = `${Math.round(coverage * 100)}% covered`;
  const filled = Math.max(0, Math.min(1, coverage)) * CIRC;

  const toNext = next ? monthlyForCoverage(s, next.min) : null;
  const bump = Math.max(1000, Math.round((s.monthlySip * 0.2) / 500) * 500);
  const afterBump = next && toNext === null ? planCoverage({ ...s, monthlySip: s.monthlySip + bump }) : null;
  const nudge =
    toNext !== null && next
      ? { extra: toNext, label: `Add ${formatINR(toNext)}/mo → ${next.name}` }
      : afterBump !== null && afterBump > coverage + 0.005
        ? { extra: bump, label: `Add ${formatINR(bump)}/mo → ${Math.round(afterBump * 100)}% covered` }
        : null;

  return (
    <div className="mt-5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-eyebrow uppercase text-on-night-2">Your climb</span>
        <span className="num text-caption text-on-night-2">{pctText} at today's pace</span>
      </div>

      <div className="mt-3 flex items-center gap-4">
        <svg
          viewBox="0 0 76 76"
          className="h-[72px] w-[72px] flex-none"
          role="img"
          aria-label={`${stage.name}, ${pctText} at today's pace. ${tone.label} investor.`}
        >
          <defs>
            <clipPath id="climb-face">
              <circle cx="38" cy="38" r="27" />
            </clipPath>
          </defs>
          {/* The ring: track, then the covered arc. */}
          <circle cx="38" cy="38" r={R} fill="none" stroke="rgb(var(--on-night-3) / 0.5)" strokeWidth="3" />
          <circle
            cx="38"
            cy="38"
            r={R}
            fill="none"
            stroke="rgb(var(--on-night))"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={`${filled.toFixed(1)} ${(CIRC - filled).toFixed(1)}`}
            transform="rotate(-90 38 38)"
          />
          {/* The bust: head, shoulders in a blazer, lapels, and the tie in
              the appetite's colour, all clipped to the disc. */}
          <circle cx="38" cy="38" r="27" fill="rgb(var(--on-night-3) / 0.3)" />
          <g clipPath="url(#climb-face)">
            <path d="M14 70 C14 52 25 46 38 46 C51 46 62 52 62 70 Z" fill="rgb(var(--on-night))" />
            <path d="M31 46 L38 58 L45 46 Z" fill="rgb(var(--night))" opacity="0.9" />
            <rect x="36.4" y="48" width="3.2" height="12" rx="1.2" fill={tone.color} />
            <circle cx="38" cy="30" r="9.5" fill="rgb(var(--on-night))" />
          </g>
        </svg>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="text-support font-medium text-on-night">{stage.name}</span>
            <span className="flex items-center gap-1" aria-label={`Stage ${index + 1} of ${STAGES.length}`}>
              {STAGES.map((st, i) => (
                <span
                  key={st.name}
                  className={`h-1.5 w-1.5 rounded-full ${i <= index ? "bg-on-night" : "border border-on-night-3"}`}
                />
              ))}
            </span>
          </div>
          <p className="mt-0.5 text-caption text-on-night-2">{stage.line}</p>
          {nudge && (
            <button
              type="button"
              onClick={() => actions.setSip(s.monthlySip + nudge.extra)}
              className="num mt-2 inline-flex h-7 items-center rounded-full border border-on-night-3/60 px-2.5 text-caption text-on-night transition hover:border-on-night-2"
            >
              {nudge.label}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
