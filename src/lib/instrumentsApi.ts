import type { AssetClassId, Fund } from "./types";

/**
 * Client for the live instrument universe (/api/instruments, AMFI via
 * mfapi.in). Every call degrades gracefully: on any failure the app keeps
 * working from its built-in fund list, so the builder never breaks offline.
 */

export interface LiveSchemeRow {
  schemeCode: number;
  schemeName: string;
  /** Real trailing returns from official NAV history; null when the scheme
   *  is too young for the window. */
  cagr1y?: number | null;
  cagr3y?: number | null;
  cagr5y?: number | null;
}

export interface LiveSchemeDetail {
  code: string;
  name: string;
  category: string;
  fundHouse: string;
  nav: number | null;
  navDate: string | null;
  cagr1y: number | null;
  cagr3y: number | null;
  cagr5y: number | null;
}

export async function searchLiveSchemes(q: string): Promise<LiveSchemeRow[]> {
  try {
    const r = await fetch(`/api/instruments?q=${encodeURIComponent(q)}`);
    if (!r.ok) return [];
    const body = (await r.json()) as { results?: LiveSchemeRow[] };
    return body.results ?? [];
  } catch {
    return [];
  }
}

export async function getLiveSchemeDetail(code: number | string): Promise<LiveSchemeDetail | null> {
  try {
    const r = await fetch(`/api/instruments?code=${encodeURIComponent(String(code))}`);
    if (!r.ok) return null;
    return (await r.json()) as LiveSchemeDetail;
  } catch {
    return null;
  }
}

/** Classify an AMFI scheme into our four bands from its name and category. */
export function inferAssetClass(name: string, category: string): AssetClassId {
  const t = `${name} ${category}`.toLowerCase();
  if (/gold|silver/.test(t)) return "gold";
  if (/hybrid|balanced advantage|balanced fund|multi asset|aggressive|conservative|equity savings|arbitrage/.test(t)) return "hybrid";
  if (/debt|bond|gilt|liquid|overnight|money market|corporate|credit risk|duration|banking and psu|floater|treasury|income fund|savings fund/.test(t)) return "debt";
  if (/equity|elss|flexi|cap|index|nifty|sensex|value fund|focused|dividend yield|sectoral|thematic/.test(t)) return "equity";
  return "hybrid";
}

/**
 * Planning estimates per band, used as the forward return for a live-added
 * scheme. Trailing CAGR is history and must not be used as a forward promise,
 * so projections run on these conservative band-level estimates instead, the
 * same way the built-in list works.
 */
const BAND_ESTIMATES: Record<AssetClassId, { expReturn: number; volatility: number; risk: Fund["risk"] }> = {
  equity: { expReturn: 0.12, volatility: 0.16, risk: "High" },
  hybrid: { expReturn: 0.1, volatility: 0.1, risk: "Moderate" },
  debt: { expReturn: 0.065, volatility: 0.03, risk: "Low" },
  gold: { expReturn: 0.08, volatility: 0.14, risk: "Moderate" },
};

/** Build a Fund row for a live scheme so the existing math works unchanged. */
export function fundFromLiveScheme(detail: LiveSchemeDetail): Fund {
  const assetClass = inferAssetClass(detail.name, detail.category);
  const est = BAND_ESTIMATES[assetClass];
  return {
    id: `live_${detail.code}`,
    name: detail.name,
    assetClass,
    risk: est.risk,
    fiveYr: detail.cagr5y != null ? Math.round(detail.cagr5y * 1000) / 10 : 0,
    expense: 0,
    expReturn: est.expReturn,
    volatility: est.volatility,
  };
}

/** A live fund read back from a saved plan. Only its id, name and band are
    taken from the save; the planning figures always come from the band, so a
    stored row can never carry its own growth rate. */
export function savedLiveFund(raw: unknown): Fund | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || !/^live_\d+$/.test(r.id) || typeof r.name !== "string" || !r.name) return null;
  // Own keys only: "toString" is "in" every object and is not an asset class.
  if (typeof r.assetClass !== "string" || !Object.prototype.hasOwnProperty.call(BAND_ESTIMATES, r.assetClass)) return null;
  const assetClass = r.assetClass as AssetClassId;
  const est = BAND_ESTIMATES[assetClass];
  const fiveYr = typeof r.fiveYr === "number" && Number.isFinite(r.fiveYr) ? r.fiveYr : 0;
  return { id: r.id, name: r.name.slice(0, 200), assetClass, risk: est.risk, fiveYr, expense: 0, expReturn: est.expReturn, volatility: est.volatility };
}
