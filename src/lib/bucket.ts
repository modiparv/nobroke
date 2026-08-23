import type { Allocation, Fund } from "./types";
// Explicit .ts extensions: this module runs under node --experimental-strip-types
// in tests as well as under Vite, and node resolves only literal paths.
import { FUND_MAP, registerFund } from "./funds.ts";
import { appetiteCeiling } from "./risk.ts";

/**
 * The bucket studio's raw material: everything an Indian portfolio actually
 * holds — platform mutual funds, index and international ETFs, gold, silver
 * and SGBs, government and corporate bonds, a REIT, cash-like funds. Each new
 * instrument is a full Fund row registered into FUND_MAP, so a bucket is a
 * plain Allocation and every existing engine function (blended return, band
 * weights, projections) works on it unchanged.
 *
 * Return figures are planning estimates at the ASSET-CLASS level, in line
 * with the illustrative fund rows — never a promise about the instrument.
 */
const NEW_INSTRUMENTS: Fund[] = [
  // ---- ETFs ----
  { id: "inst_nifty_etf", name: "Nifty 50 ETF", assetClass: "equity", risk: "Moderate", fiveYr: 17.4, expense: 0.05, expReturn: 0.115, volatility: 0.15 },
  { id: "inst_next50_etf", name: "Nifty Next 50 ETF", assetClass: "equity", risk: "High", fiveYr: 19.8, expense: 0.1, expReturn: 0.125, volatility: 0.18 },
  { id: "inst_midcap_etf", name: "Midcap 150 ETF", assetClass: "equity", risk: "High", fiveYr: 24.6, expense: 0.15, expReturn: 0.14, volatility: 0.21 },
  { id: "inst_nasdaq_fof", name: "Nasdaq 100 FoF", assetClass: "equity", risk: "High", fiveYr: 21.9, expense: 0.58, expReturn: 0.13, volatility: 0.2 },
  // ---- Gold & silver ----
  { id: "inst_silver_etf", name: "Silver ETF", assetClass: "gold", risk: "High", fiveYr: 14.1, expense: 0.45, expReturn: 0.09, volatility: 0.22 },
  { id: "inst_sgb", name: "Sovereign Gold Bond", assetClass: "gold", risk: "Moderate", fiveYr: 15.7, expense: 0, expReturn: 0.11, volatility: 0.14 },
  // ---- Bonds & debt ----
  { id: "inst_rbi_frsb", name: "RBI Floating Rate Bond", assetClass: "debt", risk: "Low", fiveYr: 7.6, expense: 0, expReturn: 0.078, volatility: 0.01 },
  { id: "inst_tmf_2030", name: "Target Maturity G-sec 2030", assetClass: "debt", risk: "Low", fiveYr: 7.1, expense: 0.2, expReturn: 0.072, volatility: 0.03 },
  // ---- Listed real estate ----
  { id: "inst_reit", name: "Office REIT", assetClass: "hybrid", risk: "Moderate", fiveYr: 11.8, expense: 0, expReturn: 0.1, volatility: 0.13 },
  // ---- Cash-like ----
  { id: "inst_arbitrage", name: "Arbitrage Fund", assetClass: "debt", risk: "Low", fiveYr: 6.4, expense: 0.4, expReturn: 0.065, volatility: 0.02 },
];
for (const f of NEW_INSTRUMENTS) registerFund(f);

export interface PoolItem {
  /** Resolves in FUND_MAP: either a platform fund or a registered instrument. */
  id: string;
  /** What this thing IS — the chip beside the name. */
  kind: string;
  /** One honest line for the tooltip. */
  note: string;
}

export interface PoolGroup {
  label: string;
  items: PoolItem[];
}

export const POOL_GROUPS: PoolGroup[] = [
  {
    label: "Fund picks",
    items: [
      { id: "parag_flexi", kind: "Flexi cap", note: "Goes wherever the manager sees value, across company sizes." },
      { id: "icici_nifty", kind: "Index fund", note: "The 50 largest listed companies, at index cost." },
      { id: "nippon_small", kind: "Small cap", note: "Small companies: the most growth, the biggest swings." },
      { id: "mirae_hybrid", kind: "Hybrid", note: "Stocks and bonds pre-blended in one fund." },
    ],
  },
  {
    label: "ETFs",
    items: [
      { id: "inst_nifty_etf", kind: "Equity ETF", note: "The Nifty 50, traded live on the exchange." },
      { id: "inst_next50_etf", kind: "Equity ETF", note: "The next rung of large companies, 51 to 100." },
      { id: "inst_midcap_etf", kind: "Equity ETF", note: "150 mid-sized companies in one line." },
      { id: "inst_nasdaq_fof", kind: "International", note: "The US tech 100, in rupees." },
    ],
  },
  {
    label: "Gold & silver",
    items: [
      { id: "nippon_gold", kind: "Gold ETF", note: "Gold in demat form, no locker." },
      { id: "inst_silver_etf", kind: "Silver ETF", note: "Silver, the industrial metal; moves harder than gold." },
      { id: "inst_sgb", kind: "Govt bond", note: "Gold price plus a 2.5% yearly coupon, from the RBI." },
    ],
  },
  {
    label: "Bonds & debt",
    items: [
      { id: "sbi_gilt", kind: "Gilt fund", note: "Lending to the Government of India." },
      { id: "hdfc_corp_bond", kind: "Corporate", note: "Lending to high-grade companies." },
      { id: "inst_rbi_frsb", kind: "Govt bond", note: "RBI's floating-rate savings bond; the rate resets with the market." },
      { id: "inst_tmf_2030", kind: "Target date", note: "G-secs held to 2030, so the yield is largely knowable." },
    ],
  },
  {
    label: "Real estate & cash",
    items: [
      { id: "inst_reit", kind: "REIT", note: "Rent-earning offices, listed; behaves between stocks and bonds." },
      { id: "icici_liquid", kind: "Liquid", note: "Parking money: steady, reachable in a day." },
      { id: "inst_arbitrage", kind: "Arbitrage", note: "Cash-like returns with equity taxation." },
    ],
  },
];

export const POOL_ITEMS: PoolItem[] = POOL_GROUPS.flatMap((g) => g.items);
const POOL_ID_SET = new Set(POOL_ITEMS.map((i) => i.id));

export function isPoolInstrument(id: string): boolean {
  return POOL_ID_SET.has(id) && !!FUND_MAP[id];
}

/**
 * Weight math for a curated bucket, kept pure so it is testable and the
 * component stays thin. Same discipline as the live mix: weights always sum
 * to exactly 100, so a bucket is never a vague sketch.
 */
export function withInstrument(bucket: Allocation, id: string): Allocation {
  if (id in bucket) return bucket;
  const ids = Object.keys(bucket);
  if (ids.length === 0) return { [id]: 100 };
  const share = 100 / (ids.length + 1);
  const rest = 100 - share;
  const otherTotal = ids.reduce((sum, k) => sum + (bucket[k] ?? 0), 0);
  const next: Allocation = { [id]: share };
  for (const k of ids) next[k] = otherTotal > 0 ? ((bucket[k] ?? 0) / otherTotal) * rest : rest / ids.length;
  return next;
}

export function withoutInstrument(bucket: Allocation, id: string): Allocation {
  const rest = Object.entries(bucket).filter(([k, v]) => k !== id && v > 0);
  const total = rest.reduce((sum, [, v]) => sum + v, 0);
  if (total <= 0) return {};
  return Object.fromEntries(rest.map(([k, v]) => [k, (v / total) * 100]));
}

/** Set one instrument's weight; the others rebalance to keep the sum at 100. */
export function withWeight(bucket: Allocation, id: string, w: number): Allocation {
  const ids = Object.keys(bucket);
  if (!(id in bucket)) return bucket;
  if (ids.length <= 1) return { [id]: 100 };
  const wv = Math.max(0, Math.min(100, w));
  const others = ids.filter((k) => k !== id);
  const otherTotal = others.reduce((sum, k) => sum + (bucket[k] ?? 0), 0);
  const rest = 100 - wv;
  const next: Allocation = { [id]: wv };
  for (const k of others) next[k] = otherTotal > 0 ? ((bucket[k] ?? 0) / otherTotal) * rest : rest / others.length;
  return next;
}

/** A starting hand for the bucket, matched to the person's risk appetite. */
export function suggestedInstruments(appetite: number): PoolItem[] {
  const ids: Record<ReturnType<typeof appetiteCeiling>, string[]> = {
    steady: ["sbi_gilt", "hdfc_corp_bond", "nippon_gold", "icici_liquid"],
    balanced: ["icici_nifty", "parag_flexi", "hdfc_corp_bond", "nippon_gold"],
    bold: ["parag_flexi", "inst_midcap_etf", "nippon_small", "nippon_gold"],
  };
  const wanted = ids[appetiteCeiling(appetite)];
  return POOL_ITEMS.filter((i) => wanted.includes(i.id));
}

/** True when the bucket and the live mix hold the same instruments at the
    same weights (within rounding), i.e. applying would change nothing. */
export function sameMix(a: Allocation, b: Allocation): boolean {
  const ka = Object.keys(a).filter((k) => (a[k] ?? 0) > 0.05);
  const kb = Object.keys(b).filter((k) => (b[k] ?? 0) > 0.05);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Math.abs((a[k] ?? 0) - (b[k] ?? 0)) < 0.5);
}
