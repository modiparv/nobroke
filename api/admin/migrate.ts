import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Applies pending SQL migrations from db/migrations in filename order,
 * tracked in schema_migration so each file runs exactly once. Guarded by
 * CRON_SECRET; POST applies, GET reports.
 *
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" .../api/admin/migrate
 */
export default async function handler(req: any, res: any) {
  const secret = process.env.CRON_SECRET;
  const auth = (req.headers?.authorization as string | undefined) ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }
  if (!(process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? process.env.POSTGRES_URL_NON_POOLING)) {
    res.status(503).json({ ok: false, error: "no Postgres connection string (DATABASE_URL / POSTGRES_URL)" });
    return;
  }

  const { makePool } = await import("../../db/pg.ts");
  const pool = makePool();
  try {
    await pool.query(
      `create table if not exists schema_migration (
         id text primary key,
         applied_at timestamptz not null default now()
       )`,
    );
    const appliedRes = await pool.query(`select id from schema_migration order by id`);
    const applied = new Set(appliedRes.rows.map((r: { id: string }) => r.id));

    const dir = join(process.cwd(), "db", "migrations");
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

    if (req.method !== "POST") {
      res.status(200).json({ ok: true, applied: [...applied], pending: files.filter((f) => !applied.has(f)) });
      return;
    }

    const ran: string[] = [];
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
    await pool.end();
  }
}
