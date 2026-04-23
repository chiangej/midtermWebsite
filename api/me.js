// GET /api/me — hydrate client UI after page refresh.
// Uses cookie only (no CSRF): CORS + SameSite=Lax already block cross-site
// reads of the response body.
import { setCors, getSessionFromCookie } from "./_auth.js";

export default async function handler(req, res) {
  setCors(req, res, "GET,OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });

  const sess = await getSessionFromCookie(req);
  if (!sess) return res.status(401).json({ error: "Not authenticated." });

  return res.status(200).json({
    id:       sess.userId,
    username: sess.username,
    avatar:   sess.avatar,
  });
}
