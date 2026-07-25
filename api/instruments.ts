/**
 * Live instrument universe, served from AMFI data via mfapi.in.
 *
 * mfapi.in republishes the official AMFI daily NAV file (the wealth spec's
 * named authoritative source) as JSON with permissive CORS-free access from
 * our own origin:
 *   GET https://api.mfapi.in/mf          -> every scheme, A to Z (~40k rows)
 *   GET https://api.mfapi.in/mf/{code}   -> meta + full NAV history, newest first
 *
 * This function proxies both so the browser never depends on a third party
 * directly, and computes trailing CAGRs server-side from the NAV history.
 * Trailing returns are history, not promises; the client says so.
 *
 *   /api/instruments?q=parag   -> { results: [{ schemeCode, schemeName }] }
 *   /api/instruments?code=122639
 *     -> { code, name, fundHouse, category, nav, navDate, cagr1y, cagr3y, cagr5y }
 */

interface ListRow {
  schemeCode: number;
  schemeName: string;
}

interface NavPoint {
  date: string; // "25-07-2026", newest first
  nav: string;
}

let listCache: { at: number; rows: ListRow[] } | null = null;
const LIST_TTL_MS = 12 * 3600 * 1000;
const MAX_RESULTS = 30;

async function fetchList(): Promise<ListRow[]> {
  if (listCache && Date.now() - listCache.at < LIST_TTL_MS) return listCache.rows;
  const r = await fetch("https://api.mfapi.in/mf");
  if (!r.ok) throw new Error(`mfapi list ${r.status}`);
  const rows = (await r.json()) as ListRow[];
  listCache = { at: Date.now(), rows };
  return rows;
}

function parseNavDate(d: string): number {
  const [dd, mm, yyyy] = d.split("-").map(Number);
  return Date.UTC(yyyy, mm - 1, dd);
}

/** CAGR over roughly `years`, from a newest-first NAV series. Null when the
 *  history is too short. The exponent uses the ACTUAL elapsed time between the
 *  two NAV points, not the nominal window, so an anniversary that lands a day
 *  or two off (weekends, holidays) cannot skew the annualisation. */
export function trailingCagr(history: NavPoint[], years: number): number | null {
  if (history.length < 2) return null;
  const latest = history[0];
  const latestNav = parseFloat(latest.nav);
  const latestT = parseNavDate(latest.date);
  const cutoff = latestT - years * 365 * 86_400_000;
  // Walk back to the first point at or before the cutoff.
  let past: NavPoint | null = null;
  for (const p of history) {
    if (parseNavDate(p.date) <= cutoff) {
      past = p;
      break;
    }
  }
  if (!past) return null;
  const pastNav = parseFloat(past.nav);
  if (!(latestNav > 0) || !(pastNav > 0)) return null;
  const actualYears = (latestT - parseNavDate(past.date)) / (365.25 * 86_400_000);
  if (actualYears < 0.5) return null;
  return Math.pow(latestNav / pastNav, 1 / actualYears) - 1;
}

export default async function handler(req: any, res: any) {
  const q = typeof req.query?.q === "string" ? req.query.q.trim() : "";
  const code = typeof req.query?.code === "string" ? req.query.code.trim() : "";

  try {
    if (code) {
      const r = await fetch(`https://api.mfapi.in/mf/${encodeURIComponent(code)}`);
      if (!r.ok) throw new Error(`mfapi detail ${r.status}`);
      const body = (await r.json()) as {
        meta?: { scheme_name?: string; scheme_category?: string; fund_house?: string };
        data?: NavPoint[];
      };
      const history = body.data ?? [];
      const latest = history[0];
      res.setHeader("Cache-Control", "s-maxage=21600, stale-while-revalidate=86400");
      res.status(200).json({
        code,
        name: body.meta?.scheme_name ?? "",
        category: body.meta?.scheme_category ?? "",
        fundHouse: body.meta?.fund_house ?? "",
        nav: latest ? parseFloat(latest.nav) : null,
        navDate: latest?.date ?? null,
        cagr1y: trailingCagr(history, 1),
        cagr3y: trailingCagr(history, 3),
        cagr5y: trailingCagr(history, 5),
      });
      return;
    }

    if (q.length >= 3) {
      const rows = await fetchList();
      const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
      const results = [];
      for (const row of rows) {
        const name = row.schemeName.toLowerCase();
        if (tokens.every((t) => name.includes(t))) {
          results.push(row);
          if (results.length >= MAX_RESULTS) break;
        }
      }
      res.setHeader("Cache-Control", "s-maxage=21600, stale-while-revalidate=86400");
      res.status(200).json({ results });
      return;
    }

    res.status(400).json({ error: "Pass ?q= (3+ chars) to search or ?code= for detail." });
  } catch (err) {
    console.error("instruments proxy error", err);
    // 502 so the client falls back to the built-in list rather than caching failure.
    res.status(502).json({ error: "Live instrument data is unavailable right now." });
  }
}
