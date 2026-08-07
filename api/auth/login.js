import { makePool, resolveDatabaseUrl } from "../_data.js";
import { authSecret, createSession, hashPassword, normalizeEmail, sessionCookie, verifyPassword } from "../_auth.js";

// Hashing a throwaway password when the account does not exist keeps the
// response time of "no such user" close to "wrong password".
const DECOY = hashPassword("decoy-password-for-timing");

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "POST only" });
    return;
  }
  const secret = authSecret();
  if (!secret || !resolveDatabaseUrl()) {
    res.status(503).json({ ok: false, error: "accounts not provisioned (AUTH_SECRET / database missing)" });
    return;
  }

  const email = normalizeEmail(req.body?.email);
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!email || !password) {
    res.status(400).json({ ok: false, error: "Enter your email and password." });
    return;
  }

  let pool = null;
  try {
    pool = makePool();
    const found = await pool.query(`select id, email, password_hash from app_user where lower(email) = $1`, [email]);
    const user = found.rows[0];
    const valid = user ? verifyPassword(password, user.password_hash) : (verifyPassword(password, DECOY), false);
    if (!valid) {
      res.status(401).json({ ok: false, error: "Wrong email or password." });
      return;
    }
    res.setHeader("Set-Cookie", sessionCookie(createSession(user.id, secret)));
    res.status(200).json({ ok: true, user: { id: user.id, email: user.email } });
  } catch (err) {
    console.error("login failed", err);
    res.status(500).json({ ok: false, error: "Could not sign in. Try again." });
  } finally {
    if (pool) await pool.end().catch(() => {});
  }
}
