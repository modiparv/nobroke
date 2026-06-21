export const btnPrimary =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-deep disabled:opacity-40 disabled:cursor-not-allowed";

export const btnGhost =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-line px-4 py-2.5 text-sm font-medium text-ink transition hover:border-ink";

export const card = "rounded-2xl border border-line bg-white p-4 sm:p-5";

/** Per-section translucent tints (over the plan's faint gradient) so each area
    reads as its own pane: money = violet, portfolio = mint, neutral = glass. */
export const sectionMoney = "rounded-2xl border border-brand/20 bg-brand/[0.06] p-4 backdrop-blur-sm sm:p-5";
export const sectionPortfolio = "rounded-2xl border border-positive/30 bg-positive/[0.08] p-4 backdrop-blur-sm sm:p-5";
export const sectionNeutral = "rounded-2xl border border-line bg-white/55 p-4 backdrop-blur-sm sm:p-5";

export const sectionLabel = "font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-muted";
