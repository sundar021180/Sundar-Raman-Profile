import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function (req, res) {
  // Check for the API key first
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY environment variable is not set.");
    return res.status(500).json({ error: "API key is not configured. Please set GEMINI_API_KEY on Vercel." });
  }

  // Check if the request method is POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { topic, context } = req.body;

  if (!topic) {
    return res.status(400).json({ error: 'Topic is required.' });
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    let prompt;
    if (context) {
        // If context is provided, generate an insight based on it.
        prompt = `Based on the following content, act as a world-class AI and Digital Transformation leader and provide a 2-3 sentence insight on the topic "${topic}". The insight should summarize a key takeaway from the content provided.

Content: "${context}"
`;
    } else {
        // If no context, use the original prompt for a general insight.
        prompt = `Based on a resume for a senior AI strategist, write a 2-3 sentence thought leadership insight on the topic: "${topic}". The response should be professional, concise, and demonstrate strategic foresight.`;
    }

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    // Check if the text is empty
    if (!text) {
        throw new Error("Gemini API returned an empty response.");
    }

    res.status(200).json({ text });
  } catch (error) {
    // Log the full error to the Vercel dashboard for debugging
    console.error("Error generating content:", error);
    res.status(500).json({ error: `An internal server error occurred. Check Vercel logs for details.`, message: error.message });
  }
}
