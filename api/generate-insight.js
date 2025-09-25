/**
 * Vercel Serverless Function to securely generate AI insights.
 * This function acts as a proxy, protecting the API key from the client-side.
 * It reads the GEMINI_API_KEY from Vercel's environment variables.
 */

// Define the API endpoint and model.
const API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent";

const MAX_PROMPT_LENGTH = 4000;

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
        console.warn('No ALLOWED_ORIGINS configured; refusing request.');
        res.status(500).json({ error: "Server misconfiguration." });
        return;
    }

    if (requestOrigin && !allowedOrigins.has(requestOrigin)) {
        res.status(403).json({ error: "Origin not allowed." });
        return;
    }

    if (requestOrigin) {
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
    const EXPECTED_ACCESS_TOKEN = process.env.GENERATE_INSIGHT_TOKEN;

    // Check if the API key is present.
    if (!GEMINI_API_KEY) {
        return res.status(500).json({ error: "API key is not configured." });
    }

    if (!EXPECTED_ACCESS_TOKEN) {
        console.warn('Missing GENERATE_INSIGHT_TOKEN; refusing to serve unsecured requests.');
        return res.status(500).json({ error: "Server misconfiguration." });
    }

    // Ensure the request method is POST.
    if (req.method !== 'POST') {
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    const providedToken = req.headers.authorization;
    if (!providedToken || providedToken !== `Bearer ${EXPECTED_ACCESS_TOKEN}`) {
        return res.status(401).json({ error: "Unauthorized." });
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
