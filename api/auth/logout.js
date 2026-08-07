import { clearSessionCookie } from "../_auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "POST only" });
    return;
  }
  res.setHeader("Set-Cookie", clearSessionCookie());
  res.status(200).json({ ok: true });
}
