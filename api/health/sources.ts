import { makePool, PgDb, resolveDatabaseUrl } from "../../db/pg.ts";
import type { Pool } from "@neondatabase/serverless";

/**
 * GET /api/health/sources: last successful sync per data source, in the
 * standard read envelope. Reports not-provisioned honestly if the database
 * does not exist yet.
 */
export default async function handler(_req: any, res: any) {
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

  let pool: Pool | null = null;
  try {
    pool = makePool();
    const db = new PgDb(pool);
    const syncs = await db.lastSuccessfulSyncs();
    res.status(200).json({
      ok: true,
      data: { sources: syncs },
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
