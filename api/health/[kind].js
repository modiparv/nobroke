import { makePool, PgDb, resolveDatabaseUrl } from "../_data.js";
import { authSecret, sessionUserId, tokenFromCookieHeader } from "../_auth.js";

/**
 * GET /api/health/:kind - the deployment's health checks behind ONE
 * serverless function. Vercel's Hobby plan caps a deployment at twelve
 * functions and the app uses all twelve, so the checks share a path
 * segment instead of a file each. The URLs are unchanged:
 *
 *   /api/health/sources  last successful sync per data source
 *   /api/health/auth     is sign-in wired on THIS deployment?
 */
export default async function handler(req, res) {
  const kind = kindOf(req);
  if (kind === "sources") return sources(res);
  if (kind === "auth") return auth(req, res);
  res.status(404).json({ ok: false, error: "Unknown health check. Try /api/health/sources or /api/health/auth." });
}

/** The path segment: from the router's query, or the URL when there is none. */
function kindOf(req) {
  const q = req.query?.kind;
  if (typeof q === "string") return q;
  const path = String(req.url ?? "").split("?")[0];
  return path.split("/").filter(Boolean).pop() ?? "";
}

/**
 * Last successful sync per data source, in the standard read envelope.
 * Reports not-provisioned honestly if the database does not exist yet.
 */
async function sources(res) {
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

/**
 * Is sign-in actually wired on THIS deployment? Reports which pieces are
 * present - a signing secret (and whether it is the dedicated AUTH_SECRET or
 * the CRON_SECRET fallback), a database URL, the two user tables, and
 * whether the request carried a live session - without ever echoing a
 * value. Open it on the preview and on production when "login doesn't
 * work": the missing piece is named in one line.
 */
async function auth(req, res) {
  const secret = authSecret();
  const auth_secret = process.env.AUTH_SECRET ? "auth_secret" : process.env.CRON_SECRET ? "cron_secret_fallback" : "none";
  const database = !!resolveDatabaseUrl();

  const token = tokenFromCookieHeader(req.headers?.cookie);
  const session = !token ? "none" : !secret ? "unknown" : sessionUserId(req) ? "valid" : "invalid";

  let tables = null;
  let warning = null;
  if (database) {
    let pool = null;
    try {
      pool = makePool();
      const r = await pool.query(`select to_regclass('app_user') as app_user, to_regclass('user_plan') as user_plan`);
      const row = r.rows[0] ?? {};
      tables = { app_user: !!row.app_user, user_plan: !!row.user_plan };
    } catch (err) {
      warning = err instanceof Error ? err.message : String(err);
    } finally {
      if (pool) await pool.end().catch(() => {});
    }
  }

  const ok = !!secret && database && !!tables && tables.app_user && tables.user_plan;
  res.status(200).json({
    ok,
    auth_secret,
    database,
    tables,
    session,
    ...(warning ? { warning } : {}),
    hint: ok
      ? "Sign-in is fully provisioned here."
      : !secret
        ? "Set AUTH_SECRET for this environment (Production and Preview are separate)."
        : !database
          ? "Set DATABASE_URL (or POSTGRES_URL) for this environment."
          : !tables
            ? "The database did not answer; see warning."
            : "Run POST /api/admin/migrate with the CRON_SECRET to create the user tables.",
  });
}
