// ════════════════════════════════════════════════════════════════
//  _auth.js  –  Server-side session tokens + shared request helpers
// ════════════════════════════════════════════════════════════════
import crypto from "node:crypto";
import { getDb } from "./_db.js";

export const SESSION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const ALLOWED_ORIGINS = [
  "https://midtermweb-rose.vercel.app",
  "http://localhost:5173",
];

// ── CORS (shared) ────────────────────────────────────────────────
export function setCors(req, res, methods = "GET,POST,OPTIONS") {
  const origin = req.headers?.origin ?? "";
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", methods);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Vary", "Origin");
}

// ── Client IP (defence-in-depth; Vercel edge sets x-real-ip) ─────
export function getClientIp(req) {
  const h = req.headers ?? {};
  return (
    h["x-real-ip"] ||
    h["x-vercel-forwarded-for"] ||
    h["x-forwarded-for"]?.split(",")[0].trim() ||
    "unknown"
  );
}

// ── Tokens ───────────────────────────────────────────────────────
export function generateToken() {
  return crypto.randomBytes(32).toString("hex"); // 256-bit, hex-encoded
}

// Store only SHA-256(token) in the DB so a DB leak cannot replay sessions.
export function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Create a new session. Returns the raw token (shown to client ONCE). */
export async function createSession(user) {
  const token = generateToken();
  const tokenHash = hashToken(token);
  const db = await getDb();
  await db.collection("sessions").insertOne({
    tokenHash,
    userId:   String(user.id ?? user._id),
    username: user.username,
    avatar:   user.avatar ?? null,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + SESSION_EXPIRY_MS),
  });
  return token;
}

/** Extract Bearer token from Authorization header. */
export function getBearerToken(req) {
  const auth = req.headers?.authorization ?? req.headers?.Authorization ?? "";
  const m = /^Bearer\s+([A-Fa-f0-9]{64})$/.exec(auth);
  return m ? m[1] : null;
}

/** Validate token from request, returns session doc or null. */
export async function requireAuth(req) {
  const token = getBearerToken(req);
  if (!token) return null;
  const tokenHash = hashToken(token);
  const db = await getDb();
  const sess = await db.collection("sessions").findOne({ tokenHash });
  if (!sess) return null;
  if (sess.expiresAt < new Date()) {
    await db.collection("sessions").deleteOne({ tokenHash });
    return null;
  }
  return sess;
}

/** Revoke a token (logout). Silent on failure. */
export async function revokeToken(token) {
  if (!token) return;
  try {
    const tokenHash = hashToken(token);
    const db = await getDb();
    await db.collection("sessions").deleteOne({ tokenHash });
  } catch { /* ignore */ }
}
