import { makePool, resolveDatabaseUrl } from "../_data.js";
import { authSecret, sessionUserId, tokenFromCookieHeader } from "../_auth.js";

/**
 * GET /api/health/auth: is sign-in actually wired on THIS deployment?
 * Reports which pieces are present - a signing secret (and whether it is
 * the dedicated AUTH_SECRET or the CRON_SECRET fallback), a database URL,
 * the two user tables, and whether the request carried a live session -
 * without ever echoing a value. Open it on the preview and on production
 * when "login doesn't work": the missing piece is named in one line.
 */
export default async function handler(req, res) {
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
