/**
 * Vercel Serverless Function to securely generate AI insights.
 * - Handles CORS correctly (same-origin, explicit allow-list, and *.wildcards)
 * - Optional bearer-token enforcement in production
 * - Simple token-bucket rate limiting
 * - Timeout & limited retries for upstream requests
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

/* ----------------------------- helpers ----------------------------- */

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
      ALLOWED_ORIGINS.split(',')
        .map(s => s.trim())
        .filter(Boolean)
    );
  }
  // Non-prod: be permissive if not configured
  if (!isProductionEnvironment()) return new Set(['*']);
  // Prod without configuration: empty set -> will error
  return new Set();
};

const isWildcardMatch = (origin, pattern) => {
  // pattern like "*.vercel.app"
  if (!pattern.startsWith('*.')) return false;
  try {
    const { hostname } = new URL(origin);
    const suffix = pattern.slice(2); // "vercel.app"
    return hostname === suffix || hostname.endsWith('.' + suffix);
  } catch {
    return false;
  }
};

const isOriginAllowed = (origin, allowed) => {
  // Same-origin fetches often have no Origin header.
  if (!origin) return true;                        // allow missing Origin (same-origin)
  if (allowed.has('*')) return true;
  if (allowed.has(origin)) return true;

  for (const entry of allowed) {
    if (entry.startsWith('*.') && isWildcardMatch(origin, entry)) return true;
  }
  return false;
};

const getCorsOriginToEcho = (origin, allowed) => {
  if (!origin) return null;                        // only echo for cross-origin
  if (allowed.has('*')) return '*';
  if (allowed.has(origin)) return origin;
  for (const entry of allowed) {
    if (entry.startsWith('*.') && isWildcardMatch(origin, entry)) return origin;
  }
  return null;
};

const getAccessTokenFromHeader = (req) => {
  const raw = req.headers?.authorization || req.headers?.Authorization;
  if (typeof raw !== 'string') return null;
  const m = raw.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
};

const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');

const getClientKey = (req, hashedToken) => {
  if (hashedToken) return `token:${hashedToken}`;
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
};

const pruneExpiredRateLimitBuckets = (now = Date.now()) => {
  if (now - lastRateLimitSweepAt < 60_000) return;
  lastRateLimitSweepAt = now;
  for (const [key, bucket] of rateLimitBuckets.entries()) {
    if (bucket.expiresAt <= now) rateLimitBuckets.delete(key);
  }
};

const isRateLimited = (clientKey, config, now = Date.now()) => {
  if (!config.maxRequests || config.maxRequests < 0) return false;
  pruneExpiredRateLimitBuckets(now);

  const b = rateLimitBuckets.get(clientKey);
  if (!b || b.expiresAt <= now) {
    rateLimitBuckets.set(clientKey, { count: 1, expiresAt: now + config.windowMs });
    return false;
  }
  if (b.count >= config.maxRequests) return true;
  b.count += 1;
  return false;
};

const secondsUntilReset = (clientKey, now = Date.now()) => {
  const b = rateLimitBuckets.get(clientKey);
  return b ? Math.max(0, Math.ceil((b.expiresAt - now) / 1000)) : 0;
};

const resetRateLimiter = () => rateLimitBuckets.clear();

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

const parseAccessTokens = () => {
  const { GENERATE_INSIGHT_ACCESS_TOKENS } = process.env;
  if (!GENERATE_INSIGHT_ACCESS_TOKENS) return new Set();
  return new Set(
    GENERATE_INSIGHT_ACCESS_TOKENS.split(',')
      .map(s => s.trim())
      .filter(Boolean)
  );
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

/* ----------------------------- handler ----------------------------- */

module.exports = async (req, res) => {
  const allowedOrigins = parseAllowedOrigins();
  const requestOrigin = req.headers.origin || '';

  // In production, require ALLOWED_ORIGINS to be set (or '*')
  if (allowedOrigins.size === 0 && isProductionEnvironment()) {
    console.error('ALLOWED_ORIGINS is not configured in production.');
    return res.status(500).json({ error: "CORS configuration is missing on the server." });
  }

  // Decide if allowed. Missing Origin => treat as same-origin and allow.
  const originAllowed = isOriginAllowed(requestOrigin, allowedOrigins);
  if (!originAllowed) {
    return res.status(403).json({ error: "Origin not allowed." });
  }

  // Set CORS headers only for cross-origin (when Origin exists).
  const echoOrigin = getCorsOriginToEcho(requestOrigin, allowedOrigins);
  if (echoOrigin) {
    res.setHeader('Access-Control-Allow-Origin', echoOrigin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '600');

  // Preflight
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // Enforce access tokens in production if configured
  const accessTokens = parseAccessTokens();
  const inProduction = isProductionEnvironment();
  const shouldEnforceAccessToken = accessTokens.size > 0;
  if (inProduction && !shouldEnforceAccessToken) {
    console.error('Access token configuration missing in production.');
    return res.status(500).json({ error: "Access token configuration is missing on the server." });
  }

  let hashedToken;
  if (shouldEnforceAccessToken) {
    const raw = getAccessTokenFromHeader(req);
    if (!raw || !accessTokens.has(raw)) {
      console.info('Rejected: missing/invalid access token.');
      return res.status(401).json({ error: "A valid access token is required." });
    }
    hashedToken = hashToken(raw);
  } else {
    console.info('Access tokens not configured; skipping enforcement (non-production).');
  }

  // API key
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    return res.status(500).json({
      error: "Gemini API key is not configured. Set GEMINI_API_KEY with your Gemini key only.",
      docs: "https://ai.google.dev/gemini-api/docs/api-key"
    });
  }

  // Method & body validation
  if (req.method !== 'POST') {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('application/json')) {
    return res.status(415).json({ error: "Content-Type must be application/json." });
  }

  const { prompt } = req.body || {};
  if (typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: "Prompt is required in the request body." });
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return res.status(413).json({ error: "Prompt is too long." });
  }

  // Rate limit
  const clientKey = getClientKey(req, hashedToken);
  const rlCfg = getRateLimitConfig();
  const now = Date.now();
  if (isRateLimited(clientKey, rlCfg, now)) {
    const retryAfter = secondsUntilReset(clientKey, now) || Math.ceil(rlCfg.windowMs / 1000);
    res.setHeader('Retry-After', retryAfter);
    console.info('Rate limit exceeded for client', clientKey, 'retry after', retryAfter);
    return res.status(429).json({ error: "Too many requests. Please slow down." });
  }

  // Call upstream
  try {
    const payload = { contents: [{ parts: [{ text: prompt }] }] };
    const reqCfg = getRequestConfig();
    const data = await callGeminiWithRetry(payload, GEMINI_API_KEY, reqCfg);
    return res.status(200).json(data);
  } catch (err) {
    console.error('API call error:', err);
    return res.status(500).json({ error: "Failed to generate insight." });
  }
};

/* ------------------------- test-only helpers ------------------------ */
module.exports.__resetRateLimiter = resetRateLimiter;
module.exports.__getRateLimiterSnapshot = () => ({ size: rateLimitBuckets.size });
