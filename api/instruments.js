import { makePool, resolveDatabaseUrl } from "./_data.js";
import { scoreFromSeries } from "./_scoring.js";

/**
 * Instrument search and detail for the app's mix builder.
 *
 *   /api/instruments?q=parag   -> { results: [{ schemeCode, schemeName }], source }
 *   /api/instruments?code=122639 -> { code, name, ..., cagr1y, cagr3y, cagr5y }
 *
 * Search is served from OUR instrument master (the AMFI universe synced
 * nightly into Postgres), falling back to mfapi.in only when the database is
 * unavailable, so the UI keeps working in unprovisioned previews.
 *
 * Detail still reads mfapi.in for now: trailing CAGRs need years of NAV
 * history and our price_quote table is accumulating from day one. Once
 * enough history exists locally this endpoint stops needing mfapi entirely.
 */

let listCache = null;
const LIST_TTL_MS = 12 * 3600 * 1000;
// Kept small because every search result is enriched with real trailing
// returns from its full NAV history before the response goes out.
const MAX_RESULTS = 10;

async function searchDb(q) {
  const pool = makePool();
  try {
    const tokens = q.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6);
    const params = [];
    const where = tokens
      .map((t) => {
        params.push(`%${t}%`);
        return `name ilike $${params.length}`;
      })
      .join(" and ");
    const res = await pool.query(
      `select amfi_code, name from instrument
       where amfi_code is not null and ${where}
       order by length(name), name
       limit ${MAX_RESULTS}`,
      params,
    );
    return res.rows.map((r) => ({ schemeCode: Number(r.amfi_code), schemeName: r.name }));
  } finally {
    await pool.end().catch(() => {});
  }
}

async function searchMfapi(q) {
  if (!listCache || Date.now() - listCache.at >= LIST_TTL_MS) {
    const r = await fetch("https://api.mfapi.in/mf");
    if (!r.ok) throw new Error(`mfapi list ${r.status}`);
    listCache = { at: Date.now(), rows: await r.json() };
  }
  const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
  const results = [];
  for (const row of listCache.rows) {
    const name = row.schemeName.toLowerCase();
    if (tokens.every((t) => name.includes(t))) {
      results.push(row);
      if (results.length >= MAX_RESULTS) break;
    }
  }
  return results;
}

function parseNavDate(d) {
  const [dd, mm, yyyy] = d.split("-").map(Number);
  return Date.UTC(yyyy, mm - 1, dd);
}

/** CAGR over roughly `years` from a newest-first NAV series, annualised on
 *  the ACTUAL elapsed time so an off-by-days anniversary cannot skew it. */
export function trailingCagr(history, years) {
  if (history.length < 2) return null;
  const latest = history[0];
  const latestNav = parseFloat(latest.nav);
  const latestT = parseNavDate(latest.date);
  const cutoff = latestT - years * 365 * 86_400_000;
  let past = null;
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

/** Full detail for one scheme: meta, latest NAV, and trailing CAGRs computed
 *  from the complete NAV history. */
async function schemeDetail(code) {
  const r = await fetch(`https://api.mfapi.in/mf/${encodeURIComponent(String(code))}`);
  if (!r.ok) throw new Error(`mfapi detail ${r.status}`);
  const body = await r.json();
  const history = body.data ?? [];
  const latest = history[0];
  const points = history.map((h) => ({ t: parseNavDate(h.date), nav: parseFloat(h.nav) }));
  return {
    code: String(code),
    name: body.meta?.scheme_name ?? "",
    category: body.meta?.scheme_category ?? "",
    fundHouse: body.meta?.fund_house ?? "",
    nav: latest ? parseFloat(latest.nav) : null,
    navDate: latest?.date ?? null,
    cagr1y: trailingCagr(history, 1),
    cagr3y: trailingCagr(history, 3),
    cagr5y: trailingCagr(history, 5),
    score: scoreFromSeries(points),
  };
}

export default async function handler(req, res) {
  const q = typeof req.query?.q === "string" ? req.query.q.trim() : "";
  const code = typeof req.query?.code === "string" ? req.query.code.trim() : "";

  try {
    if (code) {
      res.setHeader("Cache-Control", "s-maxage=21600, stale-while-revalidate=86400");
      res.status(200).json(await schemeDetail(code));
      return;
    }

    if (q.length >= 3) {
      let results;
      let source;
      if (resolveDatabaseUrl()) {
        try {
          results = await searchDb(q);
          source = "instrument_master";
        } catch (err) {
          console.error("db search failed, falling back to mfapi", err);
        }
      }
      if (!results) {
        results = await searchMfapi(q);
        source = "mfapi_fallback";
      }
      // Names only, fast: the client fetches each row's returns through the
      // (edge-cached) detail endpoint so one slow upstream history call can
      // never stall the whole search.
      res.setHeader("Cache-Control", "s-maxage=21600, stale-while-revalidate=86400");
      res.status(200).json({ results, source });
      return;
    }

    res.status(400).json({ error: "Pass ?q= (3+ chars) to search or ?code= for detail." });
  } catch (err) {
    console.error("instruments error", err);
    res.status(502).json({ error: "Instrument data is unavailable right now." });
  }
}
