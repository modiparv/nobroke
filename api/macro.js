/**
 * Macro backdrop for planning: CPI inflation and GDP growth live from the
 * World Bank open API (no key, official series), plus two curated policy
 * numbers (repo rate, 10Y G-sec) that have no dependable open feed; each
 * indicator carries its own source and as_of so nothing pretends.
 *
 * Cached in-memory for a day; degrades to the curated set if the live
 * source is unreachable, marked stale in the envelope.
 */

let cache = null;
const TTL_MS = 24 * 3600 * 1000;

const WB = "https://api.worldbank.org/v2/country/IND/indicator";

async function worldBank(indicator) {
  const r = await fetch(`${WB}/${indicator}?format=json&mrnev=1`, {
    headers: { Accept: "application/json" },
  });
  if (!r.ok) throw new Error(`worldbank ${indicator} ${r.status}`);
  const body = await r.json();
  const row = body?.[1]?.[0];
  if (!row || typeof row.value !== "number") throw new Error(`worldbank ${indicator} empty`);
  return { value: Math.round(row.value * 100) / 100, asOf: String(row.date) };
}

const CURATED = [
  { key: "repo_rate", label: "RBI repo rate", unit: "%", value: 5.5, as_of: "2025-08", source: "curated" },
  { key: "gsec_10y", label: "10Y G-sec yield", unit: "%", value: 6.3, as_of: "2025-12", source: "curated" },
];

export default async function handler(_req, res) {
  if (cache && Date.now() - cache.at < TTL_MS) {
    res.setHeader("Cache-Control", "s-maxage=43200, stale-while-revalidate=86400");
    res.status(200).json(cache.body);
    return;
  }

  const indicators = [];
  const warnings = [];
  let confidence = "high";

  try {
    const cpi = await worldBank("FP.CPI.TOTL.ZG");
    indicators.push({ key: "cpi_inflation", label: "CPI inflation", unit: "%", value: cpi.value, as_of: cpi.asOf, source: "World Bank" });
  } catch (err) {
    console.error("macro cpi failed", err);
    warnings.push("Live CPI unavailable; planning falls back to the app default.");
    confidence = "stale";
  }
  try {
    const gdp = await worldBank("NY.GDP.MKTP.KD.ZG");
    indicators.push({ key: "gdp_growth", label: "GDP growth", unit: "%", value: gdp.value, as_of: gdp.asOf, source: "World Bank" });
  } catch (err) {
    console.error("macro gdp failed", err);
    confidence = "stale";
  }
  indicators.push(...CURATED);
  warnings.push("Curated figures are maintained by hand; verify before relying on them.");

  const body = {
    ok: indicators.length > 0,
    data: { indicators },
    as_of: new Date().toISOString(),
    sources: [...new Set(indicators.map((i) => i.source))],
    confidence,
    warnings,
  };
  cache = { at: Date.now(), body };
  res.setHeader("Cache-Control", "s-maxage=43200, stale-while-revalidate=86400");
  res.status(200).json(body);
}
