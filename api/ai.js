import { isRateLimited } from "./_ratelimit.js";
import { setCors, getClientIp } from "./_auth.js";

// Allowed styles — defined server-side so clients cannot inject arbitrary system prompts
const SYSTEM_PROMPTS = {
  casual:  "請將使用者輸入的文字改寫成輕鬆、友善的口語聊天風格（繁體中文）。",
  formal:  "請將使用者輸入的文字改寫成嚴謹、正式的公文或商業書信風格（繁體中文）。",
  poetic:  "請將使用者輸入的文字改寫成富有詩意、文學感的散文風格（繁體中文）。",
  bullet:  "請將使用者輸入的文字整理成清晰的條列式重點（繁體中文），每點簡短有力。",
  english: "Please translate the user's input into natural, fluent English.",
  emojify: "請將使用者輸入的文字改寫，並在適當位置插入大量生動的 Emoji，使文字更活潑（繁體中文）。",
};

export default async function handler(req, res) {
  setCors(req, res, "POST,OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  const ip = getClientIp(req);
  // Rate limit: 20 AI requests per minute per IP
  if (isRateLimited(`ai:${ip}`, 20, 60_000))
    return res.status(429).json({ error: "Too many requests. Please slow down." });

  const { style, text } = req.body ?? {};

  if (!style || !text)
    return res.status(400).json({ error: "Missing required fields." });
  if (typeof style !== "string" || !SYSTEM_PROMPTS[style])
    return res.status(400).json({ error: "Invalid style." });
  if (typeof text !== "string" || text.trim().length === 0)
    return res.status(400).json({ error: "Text cannot be empty." });
  if (text.length > 2000)
    return res.status(400).json({ error: "Text too long (max 2000 characters)." });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "AI service not configured." });

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPTS[style] },
          { role: "user",   content: text.trim() },
        ],
        temperature: 0.85,
        max_tokens: 800,
      }),
    });

    if (!response.ok) {
      let msg = `OpenAI error ${response.status}`;
      try { const e = await response.json(); msg = e?.error?.message ?? msg; } catch { /* ignore */ }
      return res.status(502).json({ error: msg });
    }

    const data = await response.json();
    const result = data.choices?.[0]?.message?.content?.trim() ?? "";
    return res.status(200).json({ result });
  } catch (err) {
    console.error("api/ai:", err);
    return res.status(500).json({ error: "Internal server error." });
  }
}
