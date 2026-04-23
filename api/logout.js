import { setCors, revokeSession } from "./_auth.js";

export default async function handler(req, res) {
  setCors(req, res, "POST,OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  // Always clear cookies, even if the session was already invalid.
  await revokeSession(req, res);
  return res.status(200).json({ success: true });
}
