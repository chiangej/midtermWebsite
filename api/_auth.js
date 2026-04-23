// ════════════════════════════════════════════════════════════════
//  _auth.js  –  HttpOnly cookie sessions + CSRF double-submit
// ════════════════════════════════════════════════════════════════
import crypto from "node:crypto";
import { getDb } from "./_db.js";

export const SESSION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_AGE_SEC = Math.floor(SESSION_EXPIRY_MS / 1000);

const ALLOWED_ORIGINS = [
  "https://midtermweb-rose.vercel.app",
  "http://localhost:5173",
  "http://localhost:3001",
];

// __Host- prefix = Secure + Path=/ + no Domain. Strongest cookie scoping.
const COOKIE_SESSION = "__Host-session";
const COOKIE_CSRF    = "__Host-csrf";

// ── CORS (credentialed) ──────────────────────────────────────────
export function setCors(req, res, methods = "GET,POST,OPTIONS") {
  const origin = req.headers?.origin ?? "";
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  res.setHeader("Access-Control-Allow-Methods", methods);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-CSRF-Token");
  res.setHeader("Vary", "Origin");
}

export function isOriginAllowed(req) {
  const origin = req.headers?.origin ?? "";
  if (!origin) return true; // same-origin fetch may omit Origin
  return ALLOWED_ORIGINS.includes(origin);
}

// ── Client IP (Vercel edge sets x-real-ip) ───────────────────────
export function getClientIp(req) {
  const h = req.headers ?? {};
  return (
    h["x-real-ip"] ||
    h["x-vercel-forwarded-for"] ||
    h["x-forwarded-for"]?.split(",")[0].trim() ||
    "unknown"
  );
}

// ── Cookie helpers ───────────────────────────────────────────────
function serializeCookie(name, value, opts = {}) {
  const parts = [`${name}=${value}`];
  if (opts.maxAge != null) parts.push(`Max-Age=${opts.maxAge}`);
  parts.push(`Path=${opts.path ?? "/"}`);
  if (opts.httpOnly) parts.push("HttpOnly");
  if (opts.secure)   parts.push("Secure");
  if (opts.sameSite) parts.push(`SameSite=${opts.sameSite}`);
  return parts.join("; ");
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(/;\s*/)) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const k = part.slice(0, eq);
    const v = part.slice(eq + 1);
    try { out[k] = decodeURIComponent(v); } catch { out[k] = v; }
  }
  return out;
}

export function readCookie(req, name) {
  return parseCookies(req.headers?.cookie ?? "")[name] ?? null;
}

function appendSetCookie(res, value) {
  const existing = res.getHeader?.("Set-Cookie");
  if (!existing) res.setHeader("Set-Cookie", [value]);
  else if (Array.isArray(existing)) res.setHeader("Set-Cookie", [...existing, value]);
  else res.setHeader("Set-Cookie", [existing, value]);
}

function setAuthCookies(res, token, csrfToken) {
  const base = { path: "/", secure: true, sameSite: "Lax", maxAge: MAX_AGE_SEC };
  appendSetCookie(res, serializeCookie(COOKIE_SESSION, token,     { ...base, httpOnly: true }));
  appendSetCookie(res, serializeCookie(COOKIE_CSRF,    csrfToken, { ...base }));
}

export function clearAuthCookies(res) {
  const base = { path: "/", secure: true, sameSite: "Lax", maxAge: 0 };
  appendSetCookie(res, serializeCookie(COOKIE_SESSION, "", { ...base, httpOnly: true }));
  appendSetCookie(res, serializeCookie(COOKIE_CSRF,    "", { ...base }));
}

// ── Tokens ───────────────────────────────────────────────────────
export function generateToken() {
  return crypto.randomBytes(32).toString("hex"); // 256-bit
}

export function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function timingSafeEqualHex(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch { return false; }
}

/**
 * Create a new session + CSRF pair, persist hashes, and set cookies.
 * Returns nothing — caller should just send a JSON body.
 */
export async function issueSession(res, user) {
  const token = generateToken();
  const csrfToken = generateToken();
  const tokenHash = hashToken(token);
  const db = await getDb();
  await db.collection("sessions").insertOne({
    tokenHash,
    csrf: csrfToken, // stored for server-side verification (third leg of defence)
    userId:   String(user.id ?? user._id),
    username: user.username,
    avatar:   user.avatar ?? null,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + SESSION_EXPIRY_MS),
  });
  setAuthCookies(res, token, csrfToken);
}

/** Look up session by cookie. No CSRF check — use requireAuth for writes. */
export async function getSessionFromCookie(req) {
  const token = readCookie(req, COOKIE_SESSION);
  if (!token || !/^[A-Fa-f0-9]{64}$/.test(token)) return null;
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

/**
 * Require authenticated + CSRF-validated request. For state-changing methods
 * (POST/DELETE/PUT/PATCH). Returns session on success, null on any failure.
 *
 * Three independent checks:
 *   1. Origin header ∈ allow-list (blocks cross-site fetches outright)
 *   2. Session cookie → DB lookup (proves identity)
 *   3. CSRF cookie == X-CSRF-Token header == DB-stored csrf (triple-submit)
 */
export async function requireAuth(req) {
  if (!isOriginAllowed(req)) return null;

  const sess = await getSessionFromCookie(req);
  if (!sess) return null;

  const cookieCsrf = readCookie(req, COOKIE_CSRF);
  const headerCsrf =
    req.headers?.["x-csrf-token"] ?? req.headers?.["X-CSRF-Token"] ?? null;

  if (!cookieCsrf || !headerCsrf) return null;
  if (!timingSafeEqualHex(cookieCsrf, headerCsrf)) return null;
  if (!timingSafeEqualHex(cookieCsrf, sess.csrf ?? "")) return null;

  return sess;
}

/** Revoke session (logout). Silent on failure. Always clears cookies. */
export async function revokeSession(req, res) {
  const token = readCookie(req, COOKIE_SESSION);
  if (token && /^[A-Fa-f0-9]{64}$/.test(token)) {
    try {
      const tokenHash = hashToken(token);
      const db = await getDb();
      await db.collection("sessions").deleteOne({ tokenHash });
    } catch { /* ignore */ }
  }
  clearAuthCookies(res);
}
