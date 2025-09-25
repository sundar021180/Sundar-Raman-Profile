/**
 * Vercel Serverless Function to securely generate AI insights.
 * This function acts as a proxy, protecting the API key from the client-side.
 * It reads the GEMINI_API_KEY from Vercel's environment variables.
 */

// Define the API endpoint and model.
const API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent";

const MAX_PROMPT_LENGTH = 4000;

const rateLimitBuckets = new Map();

const defaultRateLimitConfig = {
    maxRequests: 5,
    windowMs: 60_000
};

const getRateLimitConfig = () => {
    const maxRequests = Number(process.env.GENERATE_INSIGHT_MAX_REQUESTS ?? defaultRateLimitConfig.maxRequests);
    const windowMs = Number(process.env.GENERATE_INSIGHT_WINDOW_MS ?? defaultRateLimitConfig.windowMs);

    return {
        maxRequests: Number.isFinite(maxRequests) ? maxRequests : defaultRateLimitConfig.maxRequests,
        windowMs: Number.isFinite(windowMs) && windowMs > 0 ? windowMs : defaultRateLimitConfig.windowMs
    };
};

const getClientKey = (req) => {
    const forwardedFor = req.headers['x-forwarded-for'];
    if (typeof forwardedFor === 'string' && forwardedFor.trim().length > 0) {
        return forwardedFor.split(',')[0].trim();
    }

    return req.socket?.remoteAddress || 'unknown';
};

const isRateLimited = (clientKey, config, now = Date.now()) => {
    if (!config.maxRequests || config.maxRequests < 0) {
        return false;
    }

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

module.exports = async (req, res) => {
    const allowedOrigins = parseAllowedOrigins();
    const requestOrigin = req.headers.origin;

    if (allowedOrigins.size === 0) {
        if (requestOrigin) {
            console.warn('No ALLOWED_ORIGINS configured. Falling back to request origin.');
            allowedOrigins.add(requestOrigin);
        } else {
            console.warn('No ALLOWED_ORIGINS configured and no request origin provided. Allowing all origins.');
            allowedOrigins.add('*');
        }
    }

    if (requestOrigin && !allowedOrigins.has(requestOrigin) && !allowedOrigins.has('*')) {
        res.status(403).json({ error: "Origin not allowed." });
        return;
    }

    if (allowedOrigins.has('*')) {
        res.setHeader('Access-Control-Allow-Origin', '*');
    } else if (requestOrigin) {
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

    const clientKey = getClientKey(req);
    const rateLimitConfig = getRateLimitConfig();
    const now = Date.now();

    if (isRateLimited(clientKey, rateLimitConfig, now)) {
        const retryAfterSeconds = secondsUntilReset(clientKey, now) || Math.ceil(rateLimitConfig.windowMs / 1000);
        res.setHeader('Retry-After', retryAfterSeconds);
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

        // Prepare the payload for the Gemini API call.
        const payload = {
            contents: [{
                parts: [{
                    text: prompt
                }]
            }]
        };

        // Make the POST request to the Gemini API.
        const apiResponse = await fetch(`${API_URL}?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        });

        // Handle API errors.
        if (!apiResponse.ok) {
            const errorText = await apiResponse.text();
            console.warn('Gemini API returned non-OK response', apiResponse.status, errorText);
            throw new Error('Upstream request failed.');
        }

        // Send the JSON response back to the client.
        const data = await apiResponse.json();
        res.status(200).json(data);

    } catch (error) {
        console.error('API call error:', error);
        res.status(500).json({ error: "Failed to generate insight." });
    }
};

module.exports.__resetRateLimiter = resetRateLimiter;
