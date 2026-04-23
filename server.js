// Local dev API server — mirrors Vercel serverless functions
// Usage: node server.js   (runs on port 3001)
import "dotenv/config";
import http from "http";
import { URL } from "url";

// Dynamically import API handlers (they use ESM export default)
const handlers = {
  "/api/users":    () => import("./api/users.js"),
  "/api/login":    () => import("./api/login.js"),
  "/api/logout":   () => import("./api/logout.js"),
  "/api/messages": () => import("./api/messages.js"),
  "/api/ai":       () => import("./api/ai.js"),
};

const PORT = 3001;
const MAX_BODY_BYTES = 3 * 1024 * 1024; // 3 MB — slightly above 2 MB avatar cap

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  // CORS for Vite dev server on :5173
  res.setHeader("Access-Control-Allow-Origin", "http://localhost:5173");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  const loader = handlers[path];
  if (!loader) { res.writeHead(404); res.end(JSON.stringify({ error: "Not found" })); return; }

  // ── Read body with size cap ──────────────────────────────────────
  let body = "";
  let aborted = false;
  try {
    for await (const chunk of req) {
      body += chunk;
      if (body.length > MAX_BODY_BYTES) {
        aborted = true;
        res.writeHead(413, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Request body too large." }));
        req.destroy();
        return;
      }
    }
  } catch {
    if (!aborted) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Malformed request." }));
    }
    return;
  }
  if (aborted) return;

  // ── Parse JSON body safely ───────────────────────────────────────
  let parsedBody = {};
  if (body) {
    const ct = req.headers["content-type"] ?? "";
    if (!ct.startsWith("application/json")) {
      res.writeHead(415, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unsupported content type." }));
      return;
    }
    try {
      parsedBody = JSON.parse(body);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON." }));
      return;
    }
  }

  // Build fake Vercel-style req/res
  const fakeReq = {
    method:  req.method,
    query:   Object.fromEntries(url.searchParams),
    body:    parsedBody,
    headers: req.headers,
  };
  let statusCode = 200;
  const fakeRes = {
    status(code) { statusCode = code; return fakeRes; },
    json(data) {
      res.writeHead(statusCode, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    },
    end()         { res.writeHead(statusCode); res.end(); },
    setHeader: res.setHeader.bind(res),
  };

  try {
    const mod = await loader();
    await mod.default(fakeReq, fakeRes);
  } catch (e) {
    console.error(e);
    res.writeHead(500);
    res.end(JSON.stringify({ error: "Internal server error" }));
  }
});

server.listen(PORT, () => console.log(`API server running at http://localhost:${PORT}`));
