import fetch from 'node-fetch';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        // Only allow POST requests to this function
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // Get the topic from the request body
    const { topic } = req.body;

    if (!topic) {
        return res.status(400).json({ error: 'Topic is required in the request body.' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        // For security, do not expose the API key to the client
        console.error('GEMINI_API_KEY environment variable is not set.');
        return res.status(500).json({ error: 'API key is missing.' });
    }
    
    // Construct the payload for the Gemini API call
    const payload = {
        contents: [{
            parts: [{
                text: `Generate a concise, single-paragraph summary on the topic "${topic}". The summary should sound like a professional thought leader in the field of AI and digital transformation, and be suitable for a professional resume or portfolio. Do not use an overly conversational tone or personal pronouns.`
            }]
        }],
        systemInstruction: {
            parts: [{
                text: `You are a world-class thought leader in AI and digital transformation. Your task is to generate a concise, professional, single-paragraph summary for a user-provided topic.`
            }]
        },
        tools: [{ "google_search": {} }],
    };

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error?.message || 'API request to Gemini failed.');
        }

        const result = await response.json();
        const generatedText = result?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (generatedText) {
            return res.status(200).json({ text: generatedText });
        } else {
            return res.status(500).json({ error: 'API response was empty or malformed.' });
        }
    } catch (error) {
        console.error('Serverless function failed:', error);
        return res.status(500).json({ error: error.message || 'An unknown error occurred.' });
    }
}
