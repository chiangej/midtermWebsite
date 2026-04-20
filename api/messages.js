import { ObjectId } from "mongodb";
import { getDb } from "./_db.js";
import { isRateLimited } from "./_ratelimit.js";

const ALLOWED_ORIGINS = [
  "https://midtermweb-rose.vercel.app",
  "http://localhost:5173",
];

function setCors(req, res) {
  const origin = req.headers?.origin ?? "";
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Vary", "Origin");
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();

  const ip = req.headers?.["x-forwarded-for"]?.split(",")[0].trim() ?? "unknown";
  if (isRateLimited(`msg:${ip}`, 30, 60_000))
    return res.status(429).json({ error: "Too many requests. Please slow down." });

  try {
    const db       = await getDb();
    const msgCol   = db.collection("messages");
    const userCol  = db.collection("users");

    if (req.method === "GET") {
      const msgs = await msgCol.find().sort({ createdAt: -1 }).limit(200).toArray();
      return res.status(200).json(
        msgs.map(({ _id, ...m }) => ({ ...m, id: _id.toString() }))
      );
    }

    if (req.method === "POST") {
      const { userId, content } = req.body ?? {};

      if (!userId || !content)
        return res.status(400).json({ error: "Missing required fields." });
      if (typeof content !== "string" || content.trim().length === 0)
        return res.status(400).json({ error: "Message cannot be empty." });
      if (content.length > 1000)
        return res.status(400).json({ error: "Message too long (max 1000 characters)." });

      // Per-user post rate limit: 5 messages per minute
      if (isRateLimited(`msg-user:${userId}`, 5, 60_000))
        return res.status(429).json({ error: "You're posting too fast. Please wait a moment." });

      // Verify userId and fetch authoritative username/avatar from DB
      let userOid;
      try { userOid = new ObjectId(userId); }
      catch { return res.status(400).json({ error: "Invalid user ID." }); }

      const user = await userCol.findOne(
        { _id: userOid },
        { projection: { username: 1, avatar: 1 } }
      );
      if (!user) return res.status(401).json({ error: "User not found." });

      const doc = {
        userId,
        username: user.username,
        avatar: user.avatar ?? null,
        content: content.trim(),
        createdAt: new Date().toISOString(),
      };
      const result = await msgCol.insertOne(doc);
      return res.status(201).json({ ...doc, id: result.insertedId.toString() });
    }

    if (req.method === "DELETE") {
      const { messageId, userId } = req.body ?? {};

      if (!messageId || !userId)
        return res.status(400).json({ error: "Missing required fields." });

      let oid;
      try { oid = new ObjectId(messageId); }
      catch { return res.status(400).json({ error: "Invalid message ID." }); }

      const msg = await msgCol.findOne({ _id: oid });
      if (!msg) return res.status(404).json({ error: "Message not found." });
      if (msg.userId !== userId)
        return res.status(403).json({ error: "Not authorized to delete this message." });

      await msgCol.deleteOne({ _id: oid });
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: "Method not allowed." });
  } catch (err) {
    console.error("api/messages:", err);
    return res.status(500).json({ error: "Internal server error." });
  }
}
