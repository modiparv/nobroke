/**
 * How short a goal is, in words that match the size of the gap. "A little
 * short" for a gap of more than half the goal misleads; the level scales the
 * wording, the pill and the colour everywhere a goal's status is shown.
 */
export type GapLevel = "on_track" | "little_short" | "short" | "far_short";

/** Shortfall as a fraction of what the goal needs by its date. */
export const LITTLE_SHORT_BELOW = 0.15;
export const FAR_SHORT_ABOVE = 0.5;

export function gapLevel(r: { onTrack: boolean; gap: number; requiredCorpus: number }): GapLevel {
  if (r.onTrack) return "on_track";
  const fraction = r.requiredCorpus > 0 ? Math.abs(r.gap) / r.requiredCorpus : 1;
  if (fraction < LITTLE_SHORT_BELOW) return "little_short";
  if (fraction > FAR_SHORT_ABOVE) return "far_short";
  return "short";
}

export const GAP_LABEL: Record<GapLevel, string> = {
  on_track: "On track",
  little_short: "A little short",
  short: "Short",
  far_short: "Far short",
};

/** The colour family a level speaks in: green, amber, or red for a gap of
    more than half the goal. */
export type GapTone = "pos" | "cau" | "neg";
export function gapTone(level: GapLevel): GapTone {
  return level === "on_track" ? "pos" : level === "far_short" ? "neg" : "cau";
}
