// ════════════════════════════════════════════════════════════════
//  utils.js  –  Shared security & storage helpers
// ════════════════════════════════════════════════════════════════

// ── Storage keys ─────────────────────────────────────────────────
export const SESSION_KEY   = "ac-session-v1";
export const FAIL_PFX      = "ac-fails-";
export const RATE_KEY      = "ac-rate-reg";

// ── Limits ───────────────────────────────────────────────────────
export const MAX_USERS         = 100;
export const MAX_MESSAGES      = 200;
export const AVATAR_MAX_BYTES  = 2 * 1024 * 1024;   // 2 MB
export const MSG_MAX_LEN       = 500;
export const SESSION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const RATE_WINDOW_MS    = 60_000;             // 1 min sliding window
export const RATE_MAX          = 3;                  // max 3 reg/min
export const LOCKOUT_MAX       = 5;                  // max failed logins
export const LOCKOUT_MS        = 5 * 60 * 1000;     // 5 min lockout

// ── API client helpers ────────────────────────────────────────────
async function apiFetch(url, options = {}) {
  let res;
  try {
    res = await fetch(url, options);
  } catch (e) {
    throw new Error("Network error: " + e.message);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { field: data.field, status: res.status });
  return data;
}

export async function apiGetUsers() {
  return apiFetch("/api/users");
}
export async function apiRegister({ username, email, password, avatar }) {
  return apiFetch("/api/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, email, password, avatar }),
  });
}
export async function apiLogin({ username, password }) {
  return apiFetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
}
export async function apiGetMessages() {
  return apiFetch("/api/messages");
}
export async function apiPostMessage({ userId, username, avatar, text }) {
  return apiFetch("/api/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, username, avatar, text }),
  });
}
export async function apiDeleteMessage(id, userId) {
  return apiFetch(`/api/messages?id=${encodeURIComponent(id)}&userId=${encodeURIComponent(userId)}`, {
    method: "DELETE",
  });
}

// ── Session (localStorage — survives page reload, expires in 7 days) ──
export function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const sess = JSON.parse(raw);
    if (Date.now() > sess.expiresAt) { localStorage.removeItem(SESSION_KEY); return null; }
    return sess;
  } catch { return null; }
}
export function saveSession(sess) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      ...sess,
      expiresAt: Date.now() + SESSION_EXPIRY_MS,
    }));
  } catch { /* ignore */ }
}
export function clearSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
}

// ── Crypto ────────────────────────────────────────────────────────
/** Generate a random 32-hex-char salt. */
export function generateSalt() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
}
/** SHA-256 hash of (salt + password), returns hex string. */
export async function hashPassword(password, salt) {
  const enc = new TextEncoder();
  const data = enc.encode(salt + password);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// ── File / image validation ───────────────────────────────────────
/** Check magic bytes: JPEG (FF D8 FF) or PNG (89 50 4E 47). */
export async function validateImageMagicBytes(file) {
  const buf = await file.slice(0, 8).arrayBuffer();
  const b = new Uint8Array(buf);
  if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return true;                          // JPEG
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return true;         // PNG
  return false;
}
/** Read a File as a base64 data URL. */
export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// ── Rate limiting ─────────────────────────────────────────────────
/** Returns true and does NOT record if already over limit; records + returns false otherwise. */
export function isRateLimited() {
  try {
    const raw = sessionStorage.getItem(RATE_KEY);
    const times = raw ? JSON.parse(raw) : [];
    const now = Date.now();
    const recent = times.filter(t => now - t < RATE_WINDOW_MS);
    if (recent.length >= RATE_MAX) return true;
    sessionStorage.setItem(RATE_KEY, JSON.stringify([...recent, now]));
    return false;
  } catch { return false; }
}

// ── Login lockout ─────────────────────────────────────────────────
export function isLoginLocked(username) {
  try {
    const raw = sessionStorage.getItem(FAIL_PFX + username.toLowerCase());
    if (!raw) return false;
    const { count, since } = JSON.parse(raw);
    if (count >= LOCKOUT_MAX && Date.now() - since < LOCKOUT_MS) return true;
    if (Date.now() - since >= LOCKOUT_MS) { sessionStorage.removeItem(FAIL_PFX + username.toLowerCase()); }
    return false;
  } catch { return false; }
}
/** Record a failed login attempt. Returns current fail count. */
export function recordLoginFail(username) {
  try {
    const key = FAIL_PFX + username.toLowerCase();
    const raw = sessionStorage.getItem(key);
    const now = Date.now();
    if (!raw) { sessionStorage.setItem(key, JSON.stringify({ count: 1, since: now })); return 1; }
    const { count, since } = JSON.parse(raw);
    if (now - since >= LOCKOUT_MS) { sessionStorage.setItem(key, JSON.stringify({ count: 1, since: now })); return 1; }
    const n = count + 1;
    sessionStorage.setItem(key, JSON.stringify({ count: n, since }));
    return n;
  } catch { return 0; }
}
export function clearLoginFail(username) {
  try { sessionStorage.removeItem(FAIL_PFX + username.toLowerCase()); } catch { /* ignore */ }
}

// ── Input sanitization ────────────────────────────────────────────
/** Strip HTML tags, null bytes, and control characters. Truncate to maxLen. */
export function sanitizeText(str, maxLen = MSG_MAX_LEN) {
  return str
    .replace(/<[^>]*>/g, "")                         // remove HTML tags
    .replace(/[&<>"'`]/g, (c) => ({                  // HTML-encode special chars
      "&": "&amp;", "<": "&lt;", ">": "&gt;",
      '"': "&quot;", "'": "&#x27;", "`": "&#x60;",
    }[c]))
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "") // strip control chars
    .slice(0, maxLen);
}

// ── Display helpers ───────────────────────────────────────────────
export function maskEmail(email) {
  const at = email.indexOf("@");
  if (at < 0) return email;
  const local = email.slice(0, at);
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(3, local.length - visible.length))}@${email.slice(at + 1)}`;
}

const AVATAR_COLORS = ["#c45c6a", "#7a9faf", "#7d9a7e", "#b07d5c", "#7a7aaf", "#af7a9f"];
export function avatarInitialColor(username) {
  let h = 0;
  for (let i = 0; i < username.length; i++) h = username.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
