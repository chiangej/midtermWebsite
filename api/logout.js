import { setCors, getBearerToken, revokeToken } from "./_auth.js";

export default async function handler(req, res) {
  setCors(req, res, "POST,OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  const token = getBearerToken(req);
  await revokeToken(token);
  return res.status(200).json({ success: true });
}
