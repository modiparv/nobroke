import type { AssetClass, AssetClassId, Fund } from "./types";

// Colours come from the asset-class code in index.css: one hue per kind of
// money, so a blue dot means stocks wherever it appears.
export const ASSET_CLASSES: Record<AssetClassId, AssetClass> = {
  equity: { id: "equity", label: "Stocks", color: "var(--class-equity)", blurb: "Owning companies. Grows the most over long periods, but moves around more." },
  debt: { id: "debt", label: "Bonds", color: "var(--class-debt)", blurb: "Lending for steady, predictable returns. Calmer than stocks." },
  gold: { id: "gold", label: "Gold", color: "var(--class-gold)", blurb: "A safety cushion that tends to hold value when things wobble." },
  hybrid: { id: "hybrid", label: "Mix", color: "var(--class-other)", blurb: "Stocks and bonds blended together in one fund." },
};

/**
 * The kinds of fund a mix is built from. These are categories, not schemes:
 * NoBroke is not a registered adviser and does not name a scheme to buy.
 * The ids still carry the scheme names they once had, because saved plans
 * store their mix by id and must keep loading. Growth and ups-and-downs are
 * planning assumptions for the category, not a record of any fund's returns;
 * fiveYr and expense are not shown anywhere.
 */
export const FUNDS: Fund[] = [
  { id: "parag_flexi", name: "Flexi-cap fund", assetClass: "equity", risk: "High", fiveYr: 22.4, expense: 0.63, expReturn: 0.14, volatility: 0.18 },
  { id: "nippon_small", name: "Small-cap fund", assetClass: "equity", risk: "High", fiveYr: 31.2, expense: 0.79, expReturn: 0.16, volatility: 0.26 },
  { id: "icici_nifty", name: "Nifty 50 index fund", assetClass: "equity", risk: "Moderate", fiveYr: 17.6, expense: 0.17, expReturn: 0.115, volatility: 0.15 },
  { id: "mirae_large", name: "Large-cap fund", assetClass: "equity", risk: "High", fiveYr: 15.1, expense: 0.54, expReturn: 0.12, volatility: 0.16 },
  { id: "quant_elss", name: "Tax-saver fund (ELSS)", assetClass: "equity", risk: "High", fiveYr: 27.3, expense: 0.77, expReturn: 0.14, volatility: 0.2 },
  { id: "hdfc_corp_bond", name: "Corporate bond fund", assetClass: "debt", risk: "Low", fiveYr: 7.2, expense: 0.36, expReturn: 0.075, volatility: 0.05 },
  { id: "icici_liquid", name: "Liquid fund", assetClass: "debt", risk: "Low", fiveYr: 6.1, expense: 0.2, expReturn: 0.06, volatility: 0.01 },
  { id: "sbi_gilt", name: "Government bond fund (gilt)", assetClass: "debt", risk: "Low", fiveYr: 8.0, expense: 0.46, expReturn: 0.07, volatility: 0.04 },
  { id: "icici_gold", name: "Gold ETF", assetClass: "gold", risk: "Moderate", fiveYr: 13.4, expense: 0.5, expReturn: 0.085, volatility: 0.14 },
  { id: "nippon_gold", name: "Gold savings fund", assetClass: "gold", risk: "Moderate", fiveYr: 13.1, expense: 0.32, expReturn: 0.085, volatility: 0.14 },
  { id: "mirae_hybrid", name: "Hybrid fund (stocks and bonds)", assetClass: "hybrid", risk: "Moderate", fiveYr: 14.0, expense: 0.6, expReturn: 0.11, volatility: 0.1 },
  { id: "hdfc_baa", name: "Balanced advantage fund", assetClass: "hybrid", risk: "Moderate", fiveYr: 15.2, expense: 0.7, expReturn: 0.105, volatility: 0.09 },
];

export const FUND_MAP: Record<string, Fund> = Object.fromEntries(FUNDS.map((f) => [f.id, f]));

/** Register a scheme fetched from the live universe (AMFI via /api/instruments)
    so every FUND_MAP lookup, and therefore all the blended math, resolves it
    exactly like a built-in row. Idempotent. */
export function registerFund(f: Fund): void {
  FUND_MAP[f.id] = f;
}

/** How a fund's weight splits into the three basket bands. */
export const COMPOSITION: Record<AssetClassId, { equity: number; debt: number; gold: number }> = {
  equity: { equity: 1, debt: 0, gold: 0 },
  debt: { equity: 0, debt: 1, gold: 0 },
  gold: { equity: 0, debt: 0, gold: 1 },
  hybrid: { equity: 0.65, debt: 0.35, gold: 0 },
};

export const CATEGORY_FILTERS: Array<{ id: "all" | AssetClassId; label: string }> = [
  { id: "all", label: "All" },
  { id: "equity", label: "Stocks" },
  { id: "debt", label: "Bonds" },
  { id: "gold", label: "Gold" },
  { id: "hybrid", label: "Mix" },
];
