import type { AssetClass } from "../types.js";

/**
 * Illustrative long-run assumptions for Indian investors. These are planning
 * estimates for the prototype, not forecasts or advice.
 */
export const ASSET_CLASSES: AssetClass[] = [
  {
    id: "equity_large",
    name: "Indian Equity — Large Cap",
    shortName: "Large Cap",
    expectedReturn: 0.12,
    volatility: 0.16,
    risk: "High",
    color: "#4f46e5",
    description: "Blue-chip Indian companies. The core long-term growth engine.",
  },
  {
    id: "equity_mid",
    name: "Indian Equity — Mid & Small Cap",
    shortName: "Mid/Small Cap",
    expectedReturn: 0.15,
    volatility: 0.24,
    risk: "Very High",
    color: "#7c3aed",
    description: "Higher growth, sharper swings. Rewards long horizons.",
  },
  {
    id: "equity_intl",
    name: "International Equity",
    shortName: "Intl Equity",
    expectedReturn: 0.11,
    volatility: 0.17,
    risk: "High",
    color: "#0ea5e9",
    description: "Global diversification across developed markets.",
  },
  {
    id: "debt_corp",
    name: "Corporate Bonds",
    shortName: "Corp Bonds",
    expectedReturn: 0.075,
    volatility: 0.05,
    risk: "Medium",
    color: "#0d9488",
    description: "Steady accrual income with moderate risk.",
  },
  {
    id: "debt_gilt",
    name: "Government Bonds (Gilt)",
    shortName: "Gilt",
    expectedReturn: 0.07,
    volatility: 0.04,
    risk: "Low",
    color: "#059669",
    description: "Sovereign-backed stability, very low default risk.",
  },
  {
    id: "gold",
    name: "Gold",
    shortName: "Gold",
    expectedReturn: 0.085,
    volatility: 0.14,
    risk: "Medium",
    color: "#f59e0b",
    description: "Inflation hedge and portfolio diversifier.",
  },
  {
    id: "reit",
    name: "REITs",
    shortName: "REITs",
    expectedReturn: 0.09,
    volatility: 0.13,
    risk: "Medium",
    color: "#db2777",
    description: "Real-estate income without owning property.",
  },
  {
    id: "liquid",
    name: "Liquid / Fixed Deposit",
    shortName: "Liquid/FD",
    expectedReturn: 0.06,
    volatility: 0.01,
    risk: "Low",
    color: "#64748b",
    description: "Capital-safe parking for near-term goals.",
  },
];

export const ASSET_MAP: Record<string, AssetClass> = Object.fromEntries(
  ASSET_CLASSES.map((a) => [a.id, a]),
);

export const EQUITY_IDS = ["equity_large", "equity_mid", "equity_intl"];
