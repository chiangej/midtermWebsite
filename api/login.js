import crypto from "node:crypto";
import { getDb } from "./_db.js";

function hashPw(password, salt) {
  return crypto.createHash("sha256").update(salt + password).digest("hex");
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  try {
    const { username, password } = req.body ?? {};
    if (!username || !password)
      return res.status(400).json({ error: "Please fill in all fields." });

    const db   = await getDb();
    const col  = db.collection("users");
    const user = await col.findOne({ usernameLower: username.toLowerCase() });

    // Same error message for both "not found" and "wrong password" to prevent user enumeration
    if (!user || hashPw(password, user.salt) !== user.passwordHash)
      return res.status(401).json({ error: "Invalid username or password." });

    return res.status(200).json({
      id:       user._id.toString(),
      username: user.username,
      avatar:   user.avatar,
      email:    user.email,
    });
  } catch (err) {
    console.error("api/login:", err);
    return res.status(500).json({ error: "Internal server error." });
  }
}
