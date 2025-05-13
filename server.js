require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { OpenAI } = require('openai');

const app = express();

// CORS Configuration: Allow the frontend domain
const allowedOrigins = process.env.NODE_ENV === 'production' 
  ? ['https://leahboulos96.github.io'] // Replace with your frontend domain
  : ['http://localhost:5173']; // For local development

app.use(cors({ origin: allowedOrigins, methods: ["GET", "POST"] }));
app.use(express.json());

// OpenAI setup
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Helper: Remove Oxford comma
const removeOxfordComma = (text) => {
  return text.replace(/(\b[^,]+), ([^,]+), and ([^,\n]+)/g, '$1, $2 and $3');
};

// --- CONTENT GENERATION ROUTE ---
app.post('/generate', async (req, res) => {
  const {
    companyName,
    productService,
    keyPoints,
    clientMaterials,
    brief,
    contentType,
    wordCount,
  } = req.body;

  try {
    const firstCompletion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: `You are a professional mining trade journalist writing Australian-style advertorials for a leading mining industry publication.`
          STRICT STYLE RULES:
- Do NOT use vague or cliched phrases (e.g. "in the ever-changing landscape", "revolutionising the sector", "game-changer", "cutting-edge").
- DO start articles with a clear, fact-based lead or concrete development — never abstract commentary.
- Follow Australian English conventions.
- Do NOT use the Oxford comma.
- Use ASX codes after first mention of companies (e.g. Rio Tinto (ASX: RIO)).
- Show AUD as $ (only use US$ or similar if needed).
- Abbreviate units with no space (e.g. 30km).
- Use sentence case for headings. Lowercase commodities, projects, and mines.
- Job titles are lowercase unless political.
- Use varied sentence lengths and paragraph lengths.
- Keep contractions to a minimum (max 2).
- Use softening terms where appropriate (e.g. “can help”, “typically”, “likely”).
- Avoid overly polished or robotic phrasing.
- Prioritise flow and readability — it’s OK if writing feels slightly uneven or informal.
- Absolutely no corporate buzzwords or filler language.`

        },
        {
          role: "user",
          content: `Company: ${companyName}\nProduct/Service: ${productService}\nKey Points: ${keyPoints}\nMaterials Provided: ${clientMaterials}\nBrief: ${brief}\nContent Type: ${contentType}\nWord Count: ${wordCount}`
        }
      ],
      temperature: 0.85,
      max_tokens: 1500,
    });

    const firstDraft = firstCompletion.choices[0].message.content;

    const humanisedCompletion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: `You are an experienced human editor. Rewrite the following content to sound more like natural journalism written by an Australian editor.`
        },
        {
          role: "user",
          content: firstDraft
        }
      ],
      temperature: 0.7,
      max_tokens: 1500,
    });

    const humanisedText = humanisedCompletion.choices[0].message.content;
    const cleaned = removeOxfordComma(humanisedText);

    res.json({ content: cleaned });

  } catch (error) {
    console.error("❌ OpenAI Content Error:", error?.response?.data || error.message || error);
    res.status(500).send("Error generating content.");
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ ChloeBot backend running at http://localhost:${PORT}`);
});
