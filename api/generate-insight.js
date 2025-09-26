/**
 * Vercel Serverless Function: Generate AI insights using the *client's* Gemini API key.
 * - Client provides Gemini key via headers (X-Gemini-Api-Key preferred; Authorization: Bearer <key> supported).
 * - No server-managed "access tokens" required.
 * - CORS (same-origin allowed, allow-list with wildcards), preflight handling.
 * - Simple IP/token-based rate limiting.
 * - Timeout + limited retries for upstream calls.
 */

const crypto = require('node:crypto');

const API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent";

const MAX_PROMPT_LENGTH = 4000;
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RETRIES = 1;

const rateLimitBuckets = new Map();
let lastRateLimitSweepAt = 0;

const defaultRateLimitConfig = { maxRequests: 5, windowMs: 60_000 };
const defaultRequestConfig   = { timeoutMs: DEFAULT_REQUEST_TIMEOUT_MS, maxRetries: DEFAULT_MAX_RETRIES };

/* ----------------------------- env helpers ----------------------------- */

const normalizeEnvironmentValue = (v) => typeof v === 'string' ? v.trim().toLowerCase() : '';

const isProductionEnvironment = () => {
  const { VERCEL_ENV, NODE_ENV } = process.env;
  const ve = normalizeEnvironmentValue(VERCEL_ENV);
  if (ve) return ve === 'production';
  const ne = normalizeEnvironmentValue(NODE_ENV);
  if (ne) return ne === 'production';
  return false;
};

const parseAllowedOrigins = () => {
  const { ALLOWED_ORIGINS } = process.env;
  if (typeof ALLOWED_ORIGINS === 'string' && ALLOWED_ORIGINS.trim()) {
    return new Set(
      ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
    );
  }
  // In non-prod, default to permissive CORS if not configured.
  if (!isProductionEnvironment()) return new Set(['*']);
  // In prod with no config: empty set means we’ll error with a clear message.
  return new Set();
};

/* --------------------------- CORS utilities --------------------------- */

const isWildcardMatch = (origin, pattern) => {
  // Accept both "*.vercel.app" and "https://*.vercel.app" patterns in env.
  const cleaned = pattern.replace(/^https?:\/\//i, '');
  if (!cleaned.startsWith('*.')) return false;
  try {
    const { hostname } = new URL(origin);
    const suffix = cleaned.slice(2); // "vercel.app"
    return hostname === suffix || hostname.endsWith('.' + suffix);
  } catch {
    return false;
  }
};

const isOriginAllowed = (origin, allowed) => {
  // Same-origin or non-CORS requests often have no Origin header -> allow.
  if (!origin) return true;
  if (allowed.has('*')) return true;
  if (allowed.has(origin)) return true;
  for (const entry of allowed) {
    if (entry.startsWith('*.') || entry.startsWith('https://*.') || entry.startsWith('http://*.')) {
      if (isWildcardMatch(origin, entry)) return true;
    }
  }
  return false;
};

const corsOriginToEcho = (origin, allowed) => {
  if (!origin) return null;               // only echo for cross-origin cases
  if (allowed.has('*')) return '*';
  if (allowed.has(origin)) return origin;
  for (const entry of allowed) {
    if (entry.startsWith('*.') || entry.startsWith('https://*.') || entry.startsWith('http://*.')) {
      if (isWildcardMatch(origin, entry)) return origin;
    }
  }
  return null;
};

/* ----------------------------- misc helpers --------------------------- */

const getClientGeminiKey = (req) => {
  // Preferred: custom header avoids ambiguity.
  const viaCustom = req.headers['x-gemini-api-key'];
  if (typeof viaCustom === 'string' && viaCustom.trim()) {
    return viaCustom.trim();
  }
  // Back-compat: Authorization: Bearer <key> (your current frontend already sends this).
  const rawAuth = req.headers?.authorization || req.headers?.Authorization;
  if (typeof rawAuth === 'string') {
    const m = rawAuth.match(/^Bearer\s+(.+)$/i);
    if (m) return m[1].trim();
  }
  return '';
};

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

const clientKeyForRateLimit = (req, clientGeminiKey) => {
  // Prefer a stable token-based bucket if the user provided a key; otherwise IP.
  if (clientGeminiKey) return `gem:${sha256(clientGeminiKey)}`;
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
};

const pruneExpiredBuckets = (now = Date.now()) => {
  if (now - lastRateLimitSweepAt < 60_000) return;
  lastRateLimitSweepAt = now;
  for (const [key, bucket] of rateLimitBuckets.entries()) {
    if (bucket.expiresAt <= now) rateLimitBuckets.delete(key);
  }
};

const isRateLimited = (bucketKey, cfg, now = Date.now()) => {
  if (!cfg.maxRequests || cfg.maxRequests < 0) return false;
  pruneExpiredBuckets(now);
  const b = rateLimitBuckets.get(bucketKey);
  if (!b || b.expiresAt <= now) {
    rateLimitBuckets.set(bucketKey, { count: 1, expiresAt: now + cfg.windowMs });
    return false;
  }
  if (b.count >= cfg.maxRequests) return true;
  b.count += 1;
  return false;
};

const secondsUntilReset = (bucketKey, now = Date.now()) => {
  const b = rateLimitBuckets.get(bucketKey);
  return b ? Math.max(0, Math.ceil((b.expiresAt - now) / 1000)) : 0;
};

const getRateLimitConfig = () => {
  const n = Number(process.env.GENERATE_INSIGHT_MAX_REQUESTS ?? defaultRateLimitConfig.maxRequests);
  const w = Number(process.env.GENERATE_INSIGHT_WINDOW_MS ?? defaultRateLimitConfig.windowMs);
  return {
    maxRequests: Number.isFinite(n) ? n : defaultRateLimitConfig.maxRequests,
    windowMs: Number.isFinite(w) && w > 0 ? w : defaultRateLimitConfig.windowMs
  };
};

const getRequestConfig = () => {
  const t = Number(process.env.GENERATE_INSIGHT_TIMEOUT_MS ?? defaultRequestConfig.timeoutMs);
  const r = Number(process.env.GENERATE_INSIGHT_MAX_RETRIES ?? defaultRequestConfig.maxRetries);
  return {
    timeoutMs: Number.isFinite(t) && t > 0 ? t : defaultRequestConfig.timeoutMs,
    maxRetries: Number.isFinite(r) && r >= 0 ? Math.min(r, 3) : defaultRequestConfig.maxRetries
  };
};

const fetchWithTimeout = async (url, options, timeoutMs) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
};

const callGeminiWithRetry = async (payload, apiKey, cfg) => {
  const { timeoutMs, maxRetries } = cfg;
  const init = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  };
  let attempt = 0, lastError;
  while (attempt <= maxRetries) {
    attempt += 1;
    try {
      const resp = await fetchWithTimeout(`${API_URL}?key=${apiKey}`, init, timeoutMs);
      if (!resp.ok) {
        const txt = await resp.text().catch(() => '');
        console.warn('Gemini non-OK', resp.status, txt);
        if (resp.status >= 500 && attempt <= maxRetries) continue;
        throw new Error('Upstream request failed.');
      }
      return resp.json();
    } catch (err) {
      lastError = err;
      const retryable = err.name === 'AbortError' || err.name === 'FetchError' || err.message === 'Upstream request failed.';
      if (!retryable || attempt > maxRetries) throw lastError;
      await new Promise(r => setTimeout(r, 200 * attempt));
    }
  }
  throw lastError || new Error('Failed to contact Gemini API.');
};

/* ------------------------------- handler ------------------------------ */

module.exports = async (req, res) => {
  const allowed = parseAllowedOrigins();
  const origin = req.headers.origin || '';

  // Require CORS config in production.
  if (allowed.size === 0 && isProductionEnvironment()) {
    return res.status(500).json({ error: "CORS configuration is missing on the server." });
  }

  // CORS decision
  if (!isOriginAllowed(origin, allowed)) {
    return res.status(403).json({ error: "Origin not allowed." });
  }
  const echo = corsOriginToEcho(origin, allowed);
  if (echo) {
    res.setHeader('Access-Control-Allow-Origin', echo);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Gemini-Api-Key');
  res.setHeader('Access-Control-Max-Age', '600');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  // Content-Type
  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('application/json')) {
    return res.status(415).json({ error: "Content-Type must be application/json." });
  }

  // Client-provided Gemini API key
  const clientGeminiKey = getClientGeminiKey(req);
  if (!clientGeminiKey) {
    // Deliberately do not mention headers in detail to avoid encouraging sniffing.
    return res.status(401).json({ error: "Gemini API key is required." });
  }

  // Validate body
  const { prompt } = req.body || {};
  if (typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: "Prompt is required in the request body." });
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return res.status(413).json({ error: "Prompt is too long." });
  }

  // Rate limit (based on API key hash or IP)
  const bucketKey = clientKeyForRateLimit(req, clientGeminiKey);
  const rlCfg = getRateLimitConfig();
  const now = Date.now();
  if (isRateLimited(bucketKey, rlCfg, now)) {
    const retryAfter = secondsUntilReset(bucketKey, now) || Math.ceil(rlCfg.windowMs / 1000);
    res.setHeader('Retry-After', retryAfter);
    return res.status(429).json({ error: "Too many requests. Please slow down." });
  }

  try {
    const payload = { contents: [{ parts: [{ text: prompt }] }] };
    const reqCfg = getRequestConfig();
    const data = await callGeminiWithRetry(payload, clientGeminiKey, reqCfg);
    return res.status(200).json(data);
  } catch (err) {
    // Do not log the API key—ever.
    console.error('API call error:', err);
    return res.status(500).json({ error: "Failed to generate insight." });
  }
};

/* ------------------------- test-only helpers ------------------------ */
module.exports.__resetRateLimiter = () => rateLimitBuckets.clear();
module.exports.__getRateLimiterSnapshot = () => ({ size: rateLimitBuckets.size });
