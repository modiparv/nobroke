import { makePool, resolveDatabaseUrl } from "../_data.js";
import { sessionUserId } from "../_auth.js";

export default async function handler(req, res) {
  const userId = sessionUserId(req);
  if (!userId || !resolveDatabaseUrl()) {
    res.status(401).json({ ok: false, user: null });
    return;
  }
  let pool = null;
  try {
    pool = makePool();
    const found = await pool.query(`select id, email from app_user where id = $1`, [userId]);
    const user = found.rows[0];
    if (!user) {
      res.status(401).json({ ok: false, user: null });
      return;
    }
    res.status(200).json({ ok: true, user });
  } catch (err) {
    console.error("me failed", err);
    res.status(500).json({ ok: false, user: null });
  } finally {
    if (pool) await pool.end().catch(() => {});
  }
}
