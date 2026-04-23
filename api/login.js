import crypto from "node:crypto";
import { getDb } from "./_db.js";
import { isRateLimited } from "./_ratelimit.js";
import { setCors, getClientIp, createSession } from "./_auth.js";

function hashPw(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100_000, 32, "sha256").toString("hex");
}

function timingSafeCompare(a, b) {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export default async function handler(req, res) {
  setCors(req, res, "POST,OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  const ip = getClientIp(req);

  // IP-level rate limit: 20 attempts per 5 minutes
  if (isRateLimited(`login-ip:${ip}`, 20, 300_000))
    return res.status(429).json({ error: "Too many login attempts. Try again later." });

  const { username, password } = req.body ?? {};

  if (!username || !password)
    return res.status(400).json({ error: "Missing credentials." });
  if (typeof username !== "string" || username.length > 20)
    return res.status(400).json({ error: "Invalid input." });
  if (typeof password !== "string" || password.length > 128)
    return res.status(400).json({ error: "Invalid input." });

  // Per-username rate limit: 10 attempts per 15 minutes
  if (isRateLimited(`login-user:${username.toLowerCase()}`, 10, 900_000))
    return res.status(429).json({ error: "Account temporarily locked due to too many failed attempts." });

  try {
    const db  = await getDb();
    const col = db.collection("users");
    const user = await col.findOne({ usernameLower: username.toLowerCase() });

    const INVALID_CREDS = { error: "Invalid username or password." };

    if (!user || !user.passwordHash || !user.salt)
      return res.status(401).json(INVALID_CREDS);

    const computed = hashPw(password, user.salt);
    if (!timingSafeCompare(computed, user.passwordHash))
      return res.status(401).json(INVALID_CREDS);

    // Issue a fresh session token on every successful login
    const token = await createSession({
      id: user._id, username: user.username, avatar: user.avatar,
    });

    const { passwordHash: _ph, salt: _s, usernameLower: _ul, emailLower: _el, _id, ...pub } = user;
    return res.status(200).json({ ...pub, id: _id.toString(), token });
  } catch (err) {
    console.error("api/login:", err);
    return res.status(500).json({ error: "Internal server error." });
  }
}
