require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { OpenAI } = require('openai');

const app = express();

// Middleware
app.use(cors({ origin: "http://localhost:5173", methods: ["GET", "POST"] }));
app.use(express.json());

// Root route for checking backend status
app.get('/', (req, res) => {
  res.send('ChloeBot Backend is running!');
});

// OpenAI setup
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Helper: Remove Oxford comma in lists like "A, B, and C" → "A, B and C"
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
          content: `You are a professional mining trade journalist writing Australian-style advertorials for a leading mining industry publication.

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
          content: `Company: ${companyName}
Product/Service: ${productService}
Key Points: ${keyPoints}
Materials Provided: ${clientMaterials}
Brief: ${brief}
Content Type: ${contentType}
Word Count: ${wordCount}`
        }
      ],
      temperature: 0.85,
      top_p: 0.9,
      presence_penalty: 0.3,
      frequency_penalty: 0.2,
      max_tokens: 1500,
    });

    const firstDraft = firstCompletion.choices[0].message.content;

    const humanisedCompletion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: `You are an experienced human editor. Rewrite the following content to sound more like natural journalism written by an Australian editor. Use varied sentence lengths, slight imperfections, soften any overly certain language, and maintain clarity and professionalism.`
        },
        {
          role: "user",
          content: firstDraft
        }
      ],
      temperature: 0.7,
      top_p: 0.85,
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

// --- RESEARCH ROUTE ---
app.post('/research', async (req, res) => {
  const { topic = "mining" } = req.body;
  const apiKey = process.env.NEWS_API_KEY;

  if (!apiKey) {
    console.error("❌ NEWS_API_KEY is missing from .env");
    return res.status(500).send("Missing GNews API key");
  }

  try {
    const response = await axios.get("https://gnews.io/api/v4/search", {
      params: {
        q: topic,
        country: "au",
        lang: "en",
        max: 10,
        sortby: "publishedAt",
        token: apiKey,
      },
    });

    const articles = response.data.articles || [];

    if (articles.length === 0) {
      return res.json({ content: "<p>No relevant articles found for this topic.</p>" });
    }

    const formatted = articles.map((article) => `
      <div style="margin-bottom: 30px;">
        <h3>${article.title}</h3>
        <p>${article.description || ""}</p>
        <a href="${article.url}" target="_blank">Read more</a><br>
        ${article.image ? `<img src="${article.image}" alt="image" style="max-width:100%; margin-top:10px;" />` : ""}
      </div>
    `).join("\n");

    res.json({ content: formatted });

  } catch (error) {
    console.error("❌ GNews Error:", error?.response?.data || error.message || error);
    res.status(500).send("Error fetching research.");
  }
});

// --- TWEAK ROUTE ---
app.post('/tweak', async (req, res) => {
  const { original, instruction } = req.body;

  if (!original || !instruction) {
    return res.status(400).send("Missing original content or instruction");
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "You are a professional Australian mining trade journalist and editor. Improve the article based on the user's instruction while keeping tone, structure, and authenticity natural and human."
        },
        {
          role: "user",
          content: `Instruction: ${instruction}\n\nOriginal Content:\n${original}`
        }
      ],
      temperature: 0.75,
      top_p: 0.9,
      max_tokens: 1500,
    });

    res.json({ content: response.choices[0].message.content });

  } catch (error) {
    console.error("❌ OpenAI Tweak Error:", error?.response?.data || error.message || error);
    res.status(500).send("Error applying tweak.");
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ ChloeBot backend running at http://localhost:${PORT}`);
});
