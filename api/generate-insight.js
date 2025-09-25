/**
 * Vercel Serverless Function to securely generate AI insights.
 * This function acts as a proxy, protecting the API key from the client-side.
 * It reads the GEMINI_API_KEY from Vercel's environment variables.
 */

// Define the API endpoint and model.
const crypto = require('node:crypto');

const API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent";

const MAX_PROMPT_LENGTH = 4000;
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RETRIES = 1;

const rateLimitBuckets = new Map();
let lastRateLimitSweepAt = 0;

const defaultRateLimitConfig = {
    maxRequests: 5,
    windowMs: 60_000
};

const defaultRequestConfig = {
    timeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
    maxRetries: DEFAULT_MAX_RETRIES
};

const getRateLimitConfig = () => {
    const maxRequests = Number(process.env.GENERATE_INSIGHT_MAX_REQUESTS ?? defaultRateLimitConfig.maxRequests);
    const windowMs = Number(process.env.GENERATE_INSIGHT_WINDOW_MS ?? defaultRateLimitConfig.windowMs);

    return {
        maxRequests: Number.isFinite(maxRequests) ? maxRequests : defaultRateLimitConfig.maxRequests,
        windowMs: Number.isFinite(windowMs) && windowMs > 0 ? windowMs : defaultRateLimitConfig.windowMs
    };
};

const getRequestConfig = () => {
    const timeoutMs = Number(process.env.GENERATE_INSIGHT_TIMEOUT_MS ?? defaultRequestConfig.timeoutMs);
    const maxRetries = Number(process.env.GENERATE_INSIGHT_MAX_RETRIES ?? defaultRequestConfig.maxRetries);

    return {
        timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : defaultRequestConfig.timeoutMs,
        maxRetries: Number.isFinite(maxRetries) && maxRetries >= 0 ? Math.min(maxRetries, 3) : defaultRequestConfig.maxRetries
    };
};

const getAccessTokenFromHeader = (req) => {
    const rawHeader = req.headers?.authorization || req.headers?.Authorization;
    if (typeof rawHeader !== 'string') {
        return null;
    }

    const match = rawHeader.match(/^Bearer\s+(.+)$/i);
    if (!match) {
        return null;
    }

    return match[1].trim();
};

const hashToken = (token) => {
    return crypto.createHash('sha256').update(token).digest('hex');
};

const getClientKey = (req, hashedToken) => {
    if (hashedToken) {
        return `token:${hashedToken}`;
    }

    const forwardedFor = req.headers['x-forwarded-for'];
    if (typeof forwardedFor === 'string' && forwardedFor.trim().length > 0) {
        return forwardedFor.split(',')[0].trim();
    }

    return req.socket?.remoteAddress || 'unknown';
};

const pruneExpiredRateLimitBuckets = (now = Date.now()) => {
    if (now - lastRateLimitSweepAt < 60_000) {
        return;
    }

    lastRateLimitSweepAt = now;

    for (const [key, bucket] of rateLimitBuckets.entries()) {
        if (bucket.expiresAt <= now) {
            rateLimitBuckets.delete(key);
        }
    }
};

const isRateLimited = (clientKey, config, now = Date.now()) => {
    if (!config.maxRequests || config.maxRequests < 0) {
        return false;
    }

    pruneExpiredRateLimitBuckets(now);

    const existingBucket = rateLimitBuckets.get(clientKey);

    if (!existingBucket || existingBucket.expiresAt <= now) {
        rateLimitBuckets.set(clientKey, {
            count: 1,
            expiresAt: now + config.windowMs
        });
        return false;
    }

    if (existingBucket.count >= config.maxRequests) {
        return true;
    }

    existingBucket.count += 1;
    return false;
};

const secondsUntilReset = (clientKey, now = Date.now()) => {
    const bucket = rateLimitBuckets.get(clientKey);
    if (!bucket) {
        return 0;
    }

    return Math.max(0, Math.ceil((bucket.expiresAt - now) / 1000));
};

const resetRateLimiter = () => {
    rateLimitBuckets.clear();
};

const parseAllowedOrigins = () => {
    const { ALLOWED_ORIGINS } = process.env;
    if (!ALLOWED_ORIGINS) {
        return new Set();
    }

    return new Set(
        ALLOWED_ORIGINS
            .split(",")
            .map((origin) => origin.trim())
            .filter(Boolean)
    );
};

const parseAccessTokens = () => {
    const { GENERATE_INSIGHT_ACCESS_TOKENS } = process.env;
    if (!GENERATE_INSIGHT_ACCESS_TOKENS) {
        return new Set();
    }

    return new Set(
        GENERATE_INSIGHT_ACCESS_TOKENS
            .split(',')
            .map((token) => token.trim())
            .filter(Boolean)
    );
};

const fetchWithTimeout = async (url, options, timeoutMs) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
        controller.abort();
    }, timeoutMs);

    try {
        return await fetch(url, {
            ...options,
            signal: controller.signal
        });
    } finally {
        clearTimeout(timeoutId);
    }
};

const callGeminiWithRetry = async (payload, apiKey, requestConfig) => {
    const { timeoutMs, maxRetries } = requestConfig;
    const requestInit = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    };

    let attempt = 0;
    let lastError;

    while (attempt <= maxRetries) {
        attempt += 1;
        try {
            const response = await fetchWithTimeout(`${API_URL}?key=${apiKey}`, requestInit, timeoutMs);
            if (!response.ok) {
                const errorText = await response.text().catch(() => '');
                console.warn('Gemini API returned non-OK response', response.status, errorText);

                if (response.status >= 500 && attempt <= maxRetries) {
                    continue;
                }

                throw new Error('Upstream request failed.');
            }

            return response.json();
        } catch (error) {
            lastError = error;

            if (error.name === 'AbortError') {
                console.warn('Gemini request aborted due to timeout.');
            }

            const isRetryable = error.name === 'AbortError' || error.name === 'FetchError' || error.message === 'Upstream request failed.';
            if (!isRetryable || attempt > maxRetries) {
                throw lastError;
            }

            await new Promise((resolve) => setTimeout(resolve, 200 * attempt));
        }
    }

    throw lastError || new Error('Failed to contact Gemini API.');
};

module.exports = async (req, res) => {
    const allowedOrigins = parseAllowedOrigins();
    const requestOrigin = req.headers.origin;

    if (allowedOrigins.size === 0) {
        console.error('ALLOWED_ORIGINS is not configured. Rejecting request.');
        res.status(500).json({ error: "CORS configuration is missing on the server." });
        return;
    }

    if (!requestOrigin && !allowedOrigins.has('*')) {
        res.status(403).json({ error: "Origin not allowed." });
        return;
    }

    if (requestOrigin && !allowedOrigins.has(requestOrigin) && !allowedOrigins.has('*')) {
        res.status(403).json({ error: "Origin not allowed." });
        return;
    }

    if (allowedOrigins.has('*')) {
        res.setHeader('Access-Control-Allow-Origin', '*');
    } else if (requestOrigin && allowedOrigins.has(requestOrigin)) {
        res.setHeader('Access-Control-Allow-Origin', requestOrigin);
    }
    res.setHeader('Vary', 'Origin');

    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '600');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
    }

    const accessTokens = parseAccessTokens();
    if (accessTokens.size === 0) {
        console.error('GENERATOR access tokens missing.');
        return res.status(500).json({ error: "Access token configuration is missing on the server." });
    }

    const rawAccessToken = getAccessTokenFromHeader(req);
    if (!rawAccessToken || !accessTokens.has(rawAccessToken)) {
        console.info('Rejected request due to missing or invalid access token.');
        return res.status(401).json({ error: "A valid access token is required." });
    }

    const hashedToken = hashToken(rawAccessToken);

    // Get the API key from the environment variables.
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

    // Check if the API key is present.
    if (!GEMINI_API_KEY) {
        return res.status(500).json({ error: "API key is not configured." });
    }

    // Ensure the request method is POST.
    if (req.method !== 'POST') {
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    const clientKey = getClientKey(req, hashedToken);
    const rateLimitConfig = getRateLimitConfig();
    const now = Date.now();

    if (isRateLimited(clientKey, rateLimitConfig, now)) {
        const retryAfterSeconds = secondsUntilReset(clientKey, now) || Math.ceil(rateLimitConfig.windowMs / 1000);
        res.setHeader('Retry-After', retryAfterSeconds);
        console.info('Rate limit exceeded for client', clientKey, 'retry after', retryAfterSeconds);
        return res.status(429).json({ error: "Too many requests. Please slow down." });
    }

    try {
        const contentType = req.headers['content-type'] || '';
        if (!contentType.includes('application/json')) {
            return res.status(415).json({ error: "Content-Type must be application/json." });
        }

        // Parse the request body to get the prompt.
        const { prompt } = req.body || {};

        if (typeof prompt !== 'string' || prompt.trim().length === 0) {
            return res.status(400).json({ error: "Prompt is required in the request body." });
        }

        if (prompt.length > MAX_PROMPT_LENGTH) {
            return res.status(413).json({ error: "Prompt is too long." });
        }

        const payload = {
            contents: [{
                parts: [{
                    text: prompt
                }]
            }]
        };
        const requestConfig = getRequestConfig();

        const data = await callGeminiWithRetry(payload, GEMINI_API_KEY, requestConfig);
        res.status(200).json(data);

    } catch (error) {
        console.error('API call error:', error);
        res.status(500).json({ error: "Failed to generate insight." });
    }
};

module.exports.__resetRateLimiter = resetRateLimiter;
module.exports.__getRateLimiterSnapshot = () => ({
    size: rateLimitBuckets.size
});
