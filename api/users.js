import crypto from "node:crypto";
import { getDb } from "./_db.js";

function generateSalt() {
  return crypto.randomBytes(16).toString("hex");
}
function hashPw(password, salt) {
  return crypto.createHash("sha256").update(salt + password).digest("hex");
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const db  = await getDb();
    const col = db.collection("users");

    // ── GET: list users (no sensitive fields) ──────────────────
    if (req.method === "GET") {
      const users = await col
        .find({}, { projection: { passwordHash: 0, salt: 0 } })
        .sort({ joinedAt: 1 })
        .toArray();
      return res.status(200).json(
        users.map(({ _id, ...u }) => ({ ...u, id: _id.toString() }))
      );
    }

    // ── POST: register ─────────────────────────────────────────
    if (req.method === "POST") {
      const { username, email, password, avatar } = req.body ?? {};

      if (!username || !email || !password)
        return res.status(400).json({ error: "Missing required fields." });

      if (!/^[A-Za-z0-9_]{3,20}$/.test(username))
        return res.status(400).json({ error: "Invalid username format.", field: "username" });

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        return res.status(400).json({ error: "Invalid email format.", field: "email" });

      if (password.length < 8)
        return res.status(400).json({ error: "Password must be at least 8 characters.", field: "password" });

      // Duplicate check
      const existing = await col.findOne({
        $or: [
          { usernameLower: username.toLowerCase() },
          { emailLower: email.toLowerCase() },
        ],
      });
      if (existing) {
        const field = existing.usernameLower === username.toLowerCase() ? "username" : "email";
        return res.status(409).json({
          error: field === "username" ? "Username already taken." : "Email already registered.",
          field,
        });
      }

      const salt         = generateSalt();
      const passwordHash = hashPw(password, salt);
      const doc = {
        username:      username.trim(),
        usernameLower: username.toLowerCase(),
        email:         email.trim(),
        emailLower:    email.trim().toLowerCase(),
        passwordHash,
        salt,
        avatar: avatar ?? null,
        joinedAt: new Date().toISOString(),
      };
      const result = await col.insertOne(doc);
      const { passwordHash: _ph, salt: _s, usernameLower: _ul, emailLower: _el, ...pub } = doc;
      return res.status(201).json({ ...pub, id: result.insertedId.toString() });
    }

    return res.status(405).json({ error: "Method not allowed." });
  } catch (err) {
    console.error("api/users:", err);
    return res.status(500).json({ error: "Internal server error." });
  }
}
