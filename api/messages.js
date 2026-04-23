import { ObjectId } from "mongodb";
import { getDb } from "./_db.js";
import { isRateLimited } from "./_ratelimit.js";
import { setCors, getClientIp, requireAuth } from "./_auth.js";

export default async function handler(req, res) {
  setCors(req, res, "GET,POST,DELETE,OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const ip = getClientIp(req);
  if (isRateLimited(`msg:${ip}`, 30, 60_000))
    return res.status(429).json({ error: "Too many requests. Please slow down." });

  try {
    const db      = await getDb();
    const msgCol  = db.collection("messages");

    if (req.method === "GET") {
      const msgs = await msgCol.find().sort({ createdAt: -1 }).limit(200).toArray();
      return res.status(200).json(
        msgs.map(({ _id, ...m }) => ({ ...m, id: _id.toString() }))
      );
    }

    // ── Write operations require a valid Bearer token ───────────────
    // The server derives userId from the authenticated session; the client
    // cannot specify who is posting / deleting. This kills impersonation.
    if (req.method === "POST" || req.method === "DELETE") {
      const session = await requireAuth(req);
      if (!session) return res.status(401).json({ error: "Authentication required." });

      if (req.method === "POST") {
        const rawContent = req.body?.content ?? req.body?.text;

        if (!rawContent)
          return res.status(400).json({ error: "Missing message content." });
        if (typeof rawContent !== "string" || rawContent.trim().length === 0)
          return res.status(400).json({ error: "Message cannot be empty." });
        if (rawContent.length > 1000)
          return res.status(400).json({ error: "Message too long (max 1000 characters)." });
        const content = rawContent.trim().replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

        // Per-user post rate limit: 5 messages per minute (keyed to token owner)
        if (isRateLimited(`msg-user:${session.userId}`, 5, 60_000))
          return res.status(429).json({ error: "You're posting too fast. Please wait a moment." });

        const doc = {
          userId:    session.userId,         // ← trusted, from token
          username:  session.username,       // ← trusted, from token
          avatar:    session.avatar ?? null, // ← trusted, from token
          content,
          createdAt: new Date().toISOString(),
        };
        const result = await msgCol.insertOne(doc);
        return res.status(201).json({ ...doc, id: result.insertedId.toString() });
      }

      if (req.method === "DELETE") {
        const messageId = req.query?.id ?? req.body?.messageId;
        if (!messageId)
          return res.status(400).json({ error: "Missing message ID." });

        let oid;
        try { oid = new ObjectId(messageId); }
        catch { return res.status(400).json({ error: "Invalid message ID." }); }

        const msg = await msgCol.findOne({ _id: oid });
        if (!msg) return res.status(404).json({ error: "Message not found." });
        // Ownership check: compare DB's stored userId against the token's userId.
        if (msg.userId !== session.userId)
          return res.status(403).json({ error: "Not authorized to delete this message." });

        await msgCol.deleteOne({ _id: oid });
        return res.status(200).json({ success: true });
      }
    }

    return res.status(405).json({ error: "Method not allowed." });
  } catch (err) {
    console.error("api/messages:", err);
    return res.status(500).json({ error: "Internal server error." });
  }
}
