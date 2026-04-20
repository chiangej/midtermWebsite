import { ObjectId } from "mongodb";
import { getDb } from "./_db.js";

const MSG_MAX = 500;

function sanitize(text) {
  return text
    .replace(/[<>]/g, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .slice(0, MSG_MAX);
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const db  = await getDb();
    const col = db.collection("messages");

    // ── GET: list messages ─────────────────────────────────────
    if (req.method === "GET") {
      const msgs = await col.find({}).sort({ postedAt: 1 }).limit(200).toArray();
      return res.status(200).json(
        msgs.map(({ _id, ...m }) => ({ ...m, id: _id.toString() }))
      );
    }

    // ── POST: new message ──────────────────────────────────────
    if (req.method === "POST") {
      const { userId, username, avatar, text } = req.body ?? {};
      if (!userId || !username || !text)
        return res.status(400).json({ error: "Missing fields." });

      const clean = sanitize(text.trim());
      if (!clean) return res.status(400).json({ error: "Message cannot be empty." });

      const doc = {
        userId,
        username,
        avatar: avatar ?? null,
        text: clean,
        postedAt: new Date().toISOString(),
      };
      const result = await col.insertOne(doc);
      return res.status(201).json({ ...doc, id: result.insertedId.toString() });
    }

    // ── DELETE: remove own message ─────────────────────────────
    if (req.method === "DELETE") {
      const { id, userId } = req.query;
      if (!id || !userId) return res.status(400).json({ error: "Missing id or userId." });

      let oid;
      try { oid = new ObjectId(id); } catch { return res.status(400).json({ error: "Invalid id." }); }

      const result = await col.deleteOne({ _id: oid, userId });
      if (result.deletedCount === 0)
        return res.status(403).json({ error: "Not found or not authorized." });

      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Method not allowed." });
  } catch (err) {
    console.error("api/messages:", err);
    return res.status(500).json({ error: "Internal server error." });
  }
}
