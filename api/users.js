import crypto from "node:crypto";
import { getDb } from "./_db.js";
import { isRateLimited } from "./_ratelimit.js";
import { setCors, getClientIp, createSession } from "./_auth.js";

const AVATAR_MAX_BYTES = 2.5 * 1024 * 1024;

function hashPw(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100_000, 32, "sha256").toString("hex");
}

export default async function handler(req, res) {
  setCors(req, res, "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const ip = getClientIp(req);
  if (isRateLimited(`users:${ip}`, 15, 60_000))
    return res.status(429).json({ error: "Too many requests. Please slow down." });

  try {
    const db  = await getDb();
    const col = db.collection("users");

    if (req.method === "GET") {
      const users = await col
        .find({}, { projection: { passwordHash: 0, salt: 0, emailLower: 0, usernameLower: 0 } })
        .sort({ joinedAt: 1 }).toArray();
      // ObjectId is no longer a secret: write operations require a Bearer token,
      // so leaked IDs cannot be used for impersonation.
      return res.status(200).json(users.map(({ _id, ...u }) => ({ ...u, id: _id.toString() })));
    }

    if (req.method === "POST") {
      const { username, email, password, avatar } = req.body ?? {};

      if (!username || !email || !password)
        return res.status(400).json({ error: "Missing required fields." });
      if (typeof username !== "string" || username.length > 20)
        return res.status(400).json({ error: "Invalid username.", field: "username" });
      if (typeof email !== "string" || email.length > 254)
        return res.status(400).json({ error: "Invalid email.", field: "email" });
      if (typeof password !== "string" || password.length > 128)
        return res.status(400).json({ error: "Invalid password.", field: "password" });
      if (!/^[A-Za-z0-9_]{3,20}$/.test(username))
        return res.status(400).json({ error: "Invalid username format.", field: "username" });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        return res.status(400).json({ error: "Invalid email format.", field: "email" });
      if (password.length < 8)
        return res.status(400).json({ error: "Password must be at least 8 characters.", field: "password" });
      if (!/[A-Z0-9!@#$%^&*]/.test(password))
        return res.status(400).json({ error: "Include at least one uppercase letter, number, or symbol.", field: "password" });
      if (avatar && typeof avatar === "string" && avatar.length > AVATAR_MAX_BYTES)
        return res.status(400).json({ error: "Avatar image too large (max 2 MB)." });
      if (avatar) {
        const b64 = typeof avatar === "string" ? (avatar.split(",")[1] ?? "") : "";
        if (!/^data:image\/(jpeg|png);base64,/.test(avatar) || b64.length < 144)
          return res.status(400).json({ error: "Avatar must be a valid JPEG or PNG image." });
      }

      const count = await col.countDocuments();
      if (count >= 100) return res.status(400).json({ error: "Registry is currently full." });

      const existing = await col.findOne({
        $or: [{ usernameLower: username.toLowerCase() }, { emailLower: email.toLowerCase() }],
      });
      if (existing) {
        const field = existing.usernameLower === username.toLowerCase() ? "username" : "email";
        return res.status(409).json({
          error: field === "username" ? "Username already taken." : "Email already registered.",
          field,
        });
      }

      const salt = crypto.randomBytes(16).toString("hex");
      const passwordHash = hashPw(password, salt);
      const doc = {
        username: username.trim(), usernameLower: username.toLowerCase(),
        email: email.trim(), emailLower: email.trim().toLowerCase(),
        passwordHash, salt, avatar: avatar ?? null,
        joinedAt: new Date().toISOString(),
      };
      const result = await col.insertOne(doc);

      // Issue a session token — client gets it once and uses it as Bearer auth
      const token = await createSession({
        id: result.insertedId, username: doc.username, avatar: doc.avatar,
      });

      const { passwordHash: _ph, salt: _s, usernameLower: _ul, emailLower: _el, ...pub } = doc;
      return res.status(201).json({
        ...pub,
        id: result.insertedId.toString(),
        token,
      });
    }

    return res.status(405).json({ error: "Method not allowed." });
  } catch (err) {
    console.error("api/users:", err);
    return res.status(500).json({ error: "Internal server error." });
  }
}
