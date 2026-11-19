import type { GapLevel } from "./lib/gap";

export const btnPrimary =
  "inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-control bg-primary px-5 text-support font-medium text-on-primary transition hover:bg-primary-hi active:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed";

/** The intake's primary action: Decade-scale (56px, soft-rounded, full width
 *  of the form column) with a solid grey disabled state - the affordance is
 *  "not yet", never an error after the fact. */
export const btnIntake =
  "inline-flex h-14 items-center justify-center gap-2 whitespace-nowrap rounded-2xl bg-primary px-8 text-body font-medium text-on-primary transition hover:bg-primary-hi active:opacity-90 disabled:cursor-not-allowed disabled:bg-line-2 disabled:text-text-2";

export const btnGhost =
  "inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-control border border-line-2 px-4 text-support font-medium text-text transition hover:border-text hover:bg-surface";

/** A bounded surface. Flat fill and a hairline: no blur, no shadow (section 9). */
export const card = "rounded-card border border-line bg-surface p-4 sm:p-5";
export const paneTop = card;

/** A section's label: 14px, sentence case, the readable grey. */
export const sectionLabel = "text-support font-medium text-text-2";

/** A goal's status in colour: the pill, the dot, the text, one family per
    gap level (lib/gap). Literal class names, so Tailwind sees them. */
export const GAP_PILL: Record<GapLevel, string> = {
  on_track: "bg-pos-bg text-pos",
  little_short: "bg-cau-bg text-cau",
  short: "bg-cau-bg text-cau",
  far_short: "bg-neg-bg text-neg",
};
export const GAP_DOT: Record<GapLevel, string> = {
  on_track: "bg-pos",
  little_short: "bg-cau-mark",
  short: "bg-cau-mark",
  far_short: "bg-neg",
};
export const GAP_TEXT: Record<GapLevel, string> = {
  on_track: "text-muted",
  little_short: "text-cau",
  short: "text-cau",
  far_short: "text-neg",
};
