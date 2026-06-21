import type { AssetClass, AssetClassId, Fund } from "./types";

export const ASSET_CLASSES: Record<AssetClassId, AssetClass> = {
  equity: { id: "equity", label: "Stocks", color: "#3D46B2", blurb: "Owning companies. Grows the most over long periods, but moves around more." },
  debt: { id: "debt", label: "Bonds", color: "#3A4256", blurb: "Lending for steady, predictable returns. Calmer than stocks." },
  gold: { id: "gold", label: "Gold", color: "#B58A3C", blurb: "A safety cushion that tends to hold value when things wobble." },
  hybrid: { id: "hybrid", label: "Mix", color: "#7B83CE", blurb: "Stocks and bonds blended together in one fund." },
};

/** Illustrative dummy data for Indian funds — planning estimates, not advice. */
export const FUNDS: Fund[] = [
  { id: "parag_flexi", name: "Parag Parikh Flexi Cap", assetClass: "equity", risk: "High", fiveYr: 22.4, expense: 0.63, expReturn: 0.14, volatility: 0.18 },
  { id: "nippon_small", name: "Nippon India Small Cap", assetClass: "equity", risk: "High", fiveYr: 31.2, expense: 0.79, expReturn: 0.16, volatility: 0.26 },
  { id: "icici_nifty", name: "ICICI Pru Nifty 50 Index", assetClass: "equity", risk: "Moderate", fiveYr: 17.6, expense: 0.17, expReturn: 0.115, volatility: 0.15 },
  { id: "mirae_large", name: "Mirae Asset Large Cap", assetClass: "equity", risk: "High", fiveYr: 15.1, expense: 0.54, expReturn: 0.12, volatility: 0.16 },
  { id: "quant_elss", name: "Quant ELSS Tax Saver", assetClass: "equity", risk: "High", fiveYr: 27.3, expense: 0.77, expReturn: 0.14, volatility: 0.2 },
  { id: "hdfc_corp_bond", name: "HDFC Corporate Bond", assetClass: "debt", risk: "Low", fiveYr: 7.2, expense: 0.36, expReturn: 0.075, volatility: 0.05 },
  { id: "icici_liquid", name: "ICICI Pru Liquid", assetClass: "debt", risk: "Low", fiveYr: 6.1, expense: 0.2, expReturn: 0.06, volatility: 0.01 },
  { id: "sbi_gilt", name: "SBI Magnum Gilt", assetClass: "debt", risk: "Low", fiveYr: 8.0, expense: 0.46, expReturn: 0.07, volatility: 0.04 },
  { id: "icici_gold", name: "ICICI Pru Gold ETF", assetClass: "gold", risk: "Moderate", fiveYr: 13.4, expense: 0.5, expReturn: 0.085, volatility: 0.14 },
  { id: "nippon_gold", name: "Nippon India Gold BeES", assetClass: "gold", risk: "Moderate", fiveYr: 13.1, expense: 0.32, expReturn: 0.085, volatility: 0.14 },
  { id: "mirae_hybrid", name: "Mirae Asset Hybrid Equity", assetClass: "hybrid", risk: "Moderate", fiveYr: 14.0, expense: 0.6, expReturn: 0.11, volatility: 0.1 },
  { id: "hdfc_baa", name: "HDFC Balanced Advantage", assetClass: "hybrid", risk: "Moderate", fiveYr: 15.2, expense: 0.7, expReturn: 0.105, volatility: 0.09 },
];

export const FUND_MAP: Record<string, Fund> = Object.fromEntries(FUNDS.map((f) => [f.id, f]));

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
