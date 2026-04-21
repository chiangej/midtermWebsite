// Local dev API server — mirrors Vercel serverless functions
// Usage: node server.js   (runs on port 3001)
import "dotenv/config";
import http from "http";
import { URL } from "url";

// Dynamically import API handlers (they use ESM export default)
const handlers = {
  "/api/users":    () => import("./api/users.js"),
  "/api/login":    () => import("./api/login.js"),
  "/api/messages": () => import("./api/messages.js"),
  "/api/ai":       () => import("./api/ai.js"),
};

const PORT = 3001;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  // CORS for Vite dev server on :5173
  res.setHeader("Access-Control-Allow-Origin", "http://localhost:5173");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  const loader = handlers[path];
  if (!loader) { res.writeHead(404); res.end(JSON.stringify({ error: "Not found" })); return; }

  // Read body
  let body = "";
  for await (const chunk of req) body += chunk;

  // Build fake Vercel-style req/res
  const fakeReq = {
    method: req.method,
    query:  Object.fromEntries(url.searchParams),
    body:   body ? JSON.parse(body) : {},
    headers: req.headers,
  };
  const chunks = [];
  let statusCode = 200;
  const fakeRes = {
    status(code) { statusCode = code; return fakeRes; },
    json(data) {
      res.writeHead(statusCode, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    },
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
