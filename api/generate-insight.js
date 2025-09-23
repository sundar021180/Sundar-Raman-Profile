import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(request, response) {
  try {
    const { userPrompt, systemPrompt } = await request.json();

    // The API key is stored securely as an environment variable, not in the code.
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return response.status(500).json({ error: "API key is not configured." });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-preview-05-20" });

    const result = await model.generateContent({
      contents: [{ parts: [{ text: userPrompt }] }],
      tools: [{ "google_search": {} }],
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      }
    });

    const text = result.response.candidates?.[0]?.content?.parts?.[0]?.text;

    if (text) {
      response.status(200).json({ text });
    } else {
      response.status(500).json({ error: "Failed to generate content." });
    }

  } catch (error) {
    console.error(error);
    response.status(500).json({ error: error.message || "An unexpected error occurred." });
  }
}

**3. Set Up Your Project on Vercel**
1.  Go to [vercel.com](https://vercel.com) and create an account.
2.  Click **"Add New"** and then **"Project."**
3.  Choose your GitHub repository from the list.
4.  In the project configuration, find the **Environment Variables** section.
5.  Add a new variable:
    * **Name:** `GEMINI_API_KEY`
    * **Value:** Paste your Google AI Studio API key here.

**4. Deploy!**
Vercel will automatically detect the `api` folder and deploy your serverless function along with your `index.html` file. It will handle the entire process of making your website live and secure.

This approach not only protects your API key but also follows a best practice for building modern web applications. Let me know if you have any questions about these steps!
