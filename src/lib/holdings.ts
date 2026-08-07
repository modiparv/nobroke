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
