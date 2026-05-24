import type { AssetCategory, Product } from "../types.js";

/** Five top-level classes, each a distinct grayscale shade (monochrome palette). */
export const CATEGORIES: AssetCategory[] = [
  { id: "equity", name: "Equity", shade: "#0a0a0a", blurb: "Direct ownership in companies. Highest long-run growth." },
  { id: "mf", name: "Mutual Funds", shade: "#454545", blurb: "Professionally managed baskets. Diversified, hands-off." },
  { id: "bond", name: "Bonds", shade: "#707070", blurb: "Lend to govts & companies for predictable income." },
  { id: "debt", name: "Debt", shade: "#9a9a9a", blurb: "Capital-safe instruments for stability and liquidity." },
  { id: "commodity", name: "Commodities", shade: "#c4c4c4", blurb: "Gold, silver & more. Inflation hedge and diversifier." },
];

export const CATEGORY_MAP: Record<string, AssetCategory> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c]),
);

/** Illustrative long-run assumptions for Indian investors — planning estimates, not advice. */
export const PRODUCTS: Product[] = [
  // Equity
  { id: "eq_large", name: "Large-Cap Stocks", shortName: "Large-Cap", categoryId: "equity", expectedReturn: 0.12, volatility: 0.16, risk: "High", growth: true, description: "Blue-chip Indian companies. Core growth engine." },
  { id: "eq_mid", name: "Mid-Cap Stocks", shortName: "Mid-Cap", categoryId: "equity", expectedReturn: 0.14, volatility: 0.22, risk: "Very High", growth: true, description: "Faster growth, sharper swings." },
  { id: "eq_small", name: "Small-Cap Stocks", shortName: "Small-Cap", categoryId: "equity", expectedReturn: 0.16, volatility: 0.28, risk: "Very High", growth: true, description: "Highest growth potential, highest volatility." },
  { id: "eq_intl", name: "International Equity", shortName: "Intl Equity", categoryId: "equity", expectedReturn: 0.11, volatility: 0.17, risk: "High", growth: true, description: "Global diversification across developed markets." },

  // Mutual Funds
  { id: "mf_index", name: "Index Funds (Nifty 50)", shortName: "Index Fund", categoryId: "mf", expectedReturn: 0.115, volatility: 0.15, risk: "High", growth: true, description: "Tracks the market at near-zero cost." },
  { id: "mf_flexi", name: "Flexi-Cap Funds", shortName: "Flexi-Cap", categoryId: "mf", expectedReturn: 0.13, volatility: 0.18, risk: "High", growth: true, description: "Manager moves across large/mid/small caps." },
  { id: "mf_elss", name: "ELSS (Tax Saver)", shortName: "ELSS", categoryId: "mf", expectedReturn: 0.13, volatility: 0.18, risk: "High", growth: true, description: "Equity funds with 80C tax benefits, 3-yr lock-in." },
  { id: "mf_hybrid", name: "Hybrid / Balanced Funds", shortName: "Hybrid", categoryId: "mf", expectedReturn: 0.095, volatility: 0.09, risk: "Medium", growth: false, description: "Equity + debt blend for a smoother ride." },

  // Bonds
  { id: "bond_gsec", name: "Government Bonds (G-Sec)", shortName: "G-Sec", categoryId: "bond", expectedReturn: 0.07, volatility: 0.04, risk: "Low", growth: false, description: "Sovereign-backed, very low default risk." },
  { id: "bond_corp", name: "Corporate Bonds", shortName: "Corp Bonds", categoryId: "bond", expectedReturn: 0.08, volatility: 0.06, risk: "Medium", growth: false, description: "Higher yield from company debt." },
  { id: "bond_psu", name: "PSU Bonds", shortName: "PSU Bonds", categoryId: "bond", expectedReturn: 0.075, volatility: 0.05, risk: "Low", growth: false, description: "Public-sector backed, steady income." },
  { id: "bond_taxfree", name: "Tax-Free Bonds", shortName: "Tax-Free", categoryId: "bond", expectedReturn: 0.065, volatility: 0.03, risk: "Low", growth: false, description: "Interest exempt from income tax." },

  // Debt
  { id: "debt_fd", name: "Fixed Deposits", shortName: "FD", categoryId: "debt", expectedReturn: 0.065, volatility: 0.01, risk: "Low", growth: false, description: "Guaranteed returns, fully capital-safe." },
  { id: "debt_ppf", name: "PPF / EPF", shortName: "PPF/EPF", categoryId: "debt", expectedReturn: 0.071, volatility: 0.005, risk: "Low", growth: false, description: "Govt-backed retirement savings, tax-free." },
  { id: "debt_liquid", name: "Liquid Funds", shortName: "Liquid", categoryId: "debt", expectedReturn: 0.06, volatility: 0.01, risk: "Low", growth: false, description: "Park cash with instant access." },
  { id: "debt_dynamic", name: "Debt Mutual Funds", shortName: "Debt Funds", categoryId: "debt", expectedReturn: 0.07, volatility: 0.03, risk: "Low", growth: false, description: "Bond portfolios managed for you." },

  // Commodities
  { id: "comm_gold", name: "Digital Gold / Gold ETF", shortName: "Gold", categoryId: "commodity", expectedReturn: 0.085, volatility: 0.14, risk: "Medium", growth: false, description: "Classic inflation hedge." },
  { id: "comm_sgb", name: "Sovereign Gold Bonds", shortName: "SGB", categoryId: "commodity", expectedReturn: 0.09, volatility: 0.13, risk: "Medium", growth: false, description: "Gold price + 2.5% interest, govt-issued." },
  { id: "comm_silver", name: "Silver ETF", shortName: "Silver", categoryId: "commodity", expectedReturn: 0.09, volatility: 0.2, risk: "High", growth: false, description: "Industrial + precious metal exposure." },
  { id: "comm_etf", name: "Multi-Commodity ETF", shortName: "Commodity ETF", categoryId: "commodity", expectedReturn: 0.08, volatility: 0.16, risk: "High", growth: false, description: "Diversified basket of commodities." },
];

export const PRODUCT_MAP: Record<string, Product> = Object.fromEntries(
  PRODUCTS.map((p) => [p.id, p]),
);

export const PRODUCTS_BY_CATEGORY: Record<string, Product[]> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, PRODUCTS.filter((p) => p.categoryId === c.id)]),
);
