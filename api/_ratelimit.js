// Simple in-memory rate limiter.
// Resets on cold start — acceptable for serverless; prevents burst abuse.
const buckets = new Map();

/**
 * @param {string}  key          - e.g. IP or "login:<username>"
 * @param {number}  maxAttempts
 * @param {number}  windowMs
 * @returns {boolean}  true = blocked
 */
export function isRateLimited(key, maxAttempts = 20, windowMs = 60_000) {
  const now = Date.now();
  let entry = buckets.get(key);
  if (!entry || now > entry.reset) {
    entry = { count: 0, reset: now + windowMs };
  }
  entry.count++;
  buckets.set(key, entry);
  return entry.count > maxAttempts;
}
