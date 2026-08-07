export const btnPrimary =
  "inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-control bg-accent px-5 text-support font-medium text-on-accent transition hover:bg-accent-hi active:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed";

export const btnGhost =
  "inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-control border border-line px-4 text-support font-medium text-text transition hover:border-line-2 hover:bg-surface";

/** A bounded surface. Flat fill and a hairline: no blur, no shadow (section 9). */
export const card = "rounded-card border border-line bg-surface p-4 sm:p-5";
export const paneTop = card;

/** One eyebrow per section. Everything else is sentence case. */
export const sectionLabel = "text-eyebrow uppercase text-text-3";
