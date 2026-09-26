/** Categories + types the user can add as existing investments.
 *  Loose product taxonomy aimed at Gen-Z / millennial Indians (per the updates doc). */
export const HOLDING_TYPES: ReadonlyArray<{ id: string; category: string; label: string; emoji: string }> = [
  // Equity
  { id: "in_stocks", category: "Equity", label: "Indian stocks", emoji: "📈" },
  { id: "us_stocks", category: "Equity", label: "US stocks (fractional)", emoji: "🌎" },
  // Funds
  { id: "mf_lump", category: "Funds", label: "Mutual fund (lumpsum)", emoji: "💸" },
  { id: "mf_sip", category: "Funds", label: "Mutual fund (SIP)", emoji: "🔁" },
  { id: "etf_in", category: "Funds", label: "ETF (Indian)", emoji: "🇮🇳" },
  { id: "etf_us", category: "Funds", label: "ETF (US)", emoji: "🇺🇸" },
  // Gold & Silver
  { id: "gold_etf", category: "Gold & Silver", label: "Gold ETF", emoji: "🥇" },
  { id: "silver_etf", category: "Gold & Silver", label: "Silver ETF", emoji: "🥈" },
  { id: "gold_mf", category: "Gold & Silver", label: "Gold mutual fund", emoji: "🪙" },
  // Fixed income / retirement / small savings
  { id: "fd", category: "Fixed income", label: "Fixed Deposit (FD)", emoji: "🏦" },
  { id: "bond", category: "Fixed income", label: "Bond", emoji: "📜" },
  { id: "nps", category: "Fixed income", label: "NPS", emoji: "🛡️" },
  { id: "epf", category: "Fixed income", label: "EPF", emoji: "💼" },
  { id: "ppf", category: "Fixed income", label: "PPF", emoji: "🌳" },
  // Other
  { id: "other", category: "Other", label: "Other holding", emoji: "🏠" },
];

export const HOLDING_TYPE_BY_LABEL: Record<string, (typeof HOLDING_TYPES)[number]> = Object.fromEntries(
  HOLDING_TYPES.map((t) => [t.label, t]),
);

/** The intake's one-line total of everything already invested, before it is
    split by type. Its category and type both say so, so the Money page never
    calls EPF or FD money "Funds" and never clashes with the Portfolio tab. */
export const UNSORTED_CATEGORY = "Not sorted yet";
export const UNSORTED_TYPE = "Not sorted yet";
export const INTAKE_HOLDING_ID = "intake";
export const INTAKE_HOLDING_NAME = "All investments";

interface HoldingLike {
  id: string;
  category: string;
  type: string;
  name: string;
}

/** Saved plans from before the rename carry the intake row as category
    "Funds", type "Portfolio", name "Existing investments". Bring that one
    row up to date. Rows the person added by hand are left alone. */
export function refreshHoldingLabels<T extends HoldingLike>(holdings: T[]): T[] {
  return holdings.map((h) => {
    if (!h || typeof h !== "object" || h.id !== INTAKE_HOLDING_ID) return h;
    if (h.type === UNSORTED_TYPE && h.category === UNSORTED_CATEGORY && h.name === INTAKE_HOLDING_NAME) return h;
    return { ...h, category: UNSORTED_CATEGORY, type: UNSORTED_TYPE, name: INTAKE_HOLDING_NAME };
  });
}

/** The asset-class colour code for holding categories (tokens in index.css):
    one hue per kind of money. The hue carries dots, bars and meters; the
    tint grounds treemap tiles with the hue as ink. */
export const CATEGORY_CODE: Record<string, { bg: string; ink: string }> = {
  Equity: { bg: "var(--class-equity-bg)", ink: "var(--class-equity)" },
  Funds: { bg: "var(--class-funds-bg)", ink: "var(--class-funds)" },
  "Fixed income": { bg: "var(--class-debt-bg)", ink: "var(--class-debt)" },
  "Gold & Silver": { bg: "var(--class-gold-bg)", ink: "var(--class-gold)" },
  Cash: { bg: "var(--class-cash-bg)", ink: "var(--class-cash)" },
  Other: { bg: "var(--class-cash-bg)", ink: "var(--class-cash)" },
  [UNSORTED_CATEGORY]: { bg: "var(--class-funds-bg)", ink: "var(--class-funds)" },
};

export function categoryCode(category: string): { bg: string; ink: string } {
  return CATEGORY_CODE[category] ?? CATEGORY_CODE.Other;
}
