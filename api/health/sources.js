import { makePool, PgDb, resolveDatabaseUrl } from "../_data.js";

/**
 * GET /api/health/sources: last successful sync per data source, in the
 * standard read envelope. Reports not-provisioned honestly if the database
 * does not exist yet.
 */
export default async function handler(_req, res) {
  if (!resolveDatabaseUrl()) {
    res.status(503).json({
      ok: false,
      data: null,
      as_of: null,
      sources: [],
      confidence: "stale",
      warnings: ["data layer not provisioned: no Postgres URL (DATABASE_URL / POSTGRES_URL)."],
    });
    return;
  }

  let pool = null;
  try {
    pool = makePool();
    const db = new PgDb(pool);
    const syncs = await db.lastSuccessfulSyncs();
    const counts = await pool.query(
      `select (select count(*)::int from instrument) as instruments,
              (select count(*)::int from price_quote) as quotes`,
    );
    res.status(200).json({
      ok: true,
      data: { sources: syncs, instruments: counts.rows[0].instruments, quotes: counts.rows[0].quotes },
      as_of: new Date().toISOString(),
      sources: syncs.map((s) => s.dataSourceCode),
      confidence: "high",
      warnings: syncs.length === 0 ? ["no successful sync recorded yet"] : [],
    });
  } catch (err) {
    console.error("health/sources failed", err);
    res.status(500).json({
      ok: false,
      data: null,
      as_of: null,
      sources: [],
      confidence: "stale",
      warnings: [err instanceof Error ? err.message : String(err)],
    });
  } finally {
    if (pool) await pool.end().catch(() => {});
  }
}
