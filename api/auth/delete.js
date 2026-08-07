import { makePool, resolveDatabaseUrl } from "../_data.js";
import { clearSessionCookie, sessionUserId } from "../_auth.js";

/** Account deletion is a right: hard-deletes the user and, via cascade,
 *  their stored plan. Market data is untouched. */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "POST only" });
    return;
  }
  const userId = sessionUserId(req);
  if (!userId || !resolveDatabaseUrl()) {
    res.status(401).json({ ok: false, error: "not signed in" });
    return;
  }
  let pool = null;
  try {
    pool = makePool();
    await pool.query(`delete from app_user where id = $1`, [userId]);
    res.setHeader("Set-Cookie", clearSessionCookie());
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("delete account failed", err);
    res.status(500).json({ ok: false, error: "Could not delete the account. Try again." });
  } finally {
    if (pool) await pool.end().catch(() => {});
  }
}
