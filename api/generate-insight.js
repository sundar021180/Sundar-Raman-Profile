/**
 * Vercel Serverless Function to securely generate AI insights.
 * This function acts as a proxy, protecting the API key from the client-side.
 * It reads the GEMINI_API_KEY from Vercel's environment variables.
 */

// Define the API endpoint and model.
const API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent";

module.exports = async (req, res) => {
    // Set headers for CORS policy to allow requests from the main page.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
    }

    // Ensure the request method is POST.
    if (req.method !== 'POST') {
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    // Get the API key from the environment variables.
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

    // Check if the API key is present.
    if (!GEMINI_API_KEY) {
        return res.status(500).json({ error: "API key is not configured." });
    }

    try {
        // Parse the request body to get the prompt and context.
        const { prompt } = req.body;

        if (!prompt) {
            return res.status(400).json({ error: "Prompt is required in the request body." });
        }

        // Prepare the payload for the Gemini API call.
        const payload = {
            contents: [{
                parts: [{
                    text: prompt
                }]
            }],
            tools: [{ "google_search": {} }],
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
            throw new Error(`API call failed with status ${apiResponse.status}: ${errorText}`);
        }

        // Send the JSON response back to the client.
        const data = await apiResponse.json();
        res.status(200).json(data);

    } catch (error) {
        console.error('API call error:', error);
        res.status(500).json({ error: "Failed to generate insight.", details: error.message });
    }
};
