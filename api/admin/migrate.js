import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { makePool, resolveDatabaseUrl } from "../_data.js";

/**
 * Applies pending SQL migrations from db/migrations in filename order,
 * tracked in schema_migration so each file runs exactly once. Guarded by
 * CRON_SECRET; POST applies, GET reports.
 */
export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers?.authorization ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }

  let pool = null;
  try {
    if (!resolveDatabaseUrl()) {
      res.status(503).json({ ok: false, error: "no Postgres connection string (DATABASE_URL / POSTGRES_URL)" });
      return;
    }
    pool = makePool();

    await pool.query(
      `create table if not exists schema_migration (
         id text primary key,
         applied_at timestamptz not null default now()
       )`,
    );
    const appliedRes = await pool.query(`select id from schema_migration order by id`);
    const applied = new Set(appliedRes.rows.map((r) => r.id));

    const dir = join(process.cwd(), "db", "migrations");
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

    if (req.method !== "POST") {
      res.status(200).json({ ok: true, applied: [...applied], pending: files.filter((f) => !applied.has(f)) });
      return;
    }

    const ran = [];
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = readFileSync(join(dir, file), "utf8");
      // A multi-statement simple query runs as one implicit transaction.
      await pool.query(sql);
      await pool.query(`insert into schema_migration (id) values ($1)`, [file]);
      ran.push(file);
    }
    res.status(200).json({ ok: true, ran, alreadyApplied: [...applied] });
  } catch (err) {
    console.error("migrate failed", err);
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  } finally {
    if (pool) await pool.end().catch(() => {});
  }
}
