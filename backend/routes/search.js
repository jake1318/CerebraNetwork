const express = require("express");
const axios = require("axios");

const router = express.Router();

router.get("/", async (req, res) => {
  const query = req.query.q;
  if (!query)
    return res.status(400).json({ error: 'Query parameter "q" is required' });

  try {
    const [aiRes, ytRes, googleRes] = await Promise.all([
      // OpenAI API call using GPT-4 via Chat Completion endpoint
      axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model: "gpt-4o",
          messages: [{ role: "user", content: query }],
          max_tokens: 100,
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          },
        }
      ),
      // YouTube Data API call using params for proper encoding
      axios.get("https://www.googleapis.com/youtube/v3/search", {
        params: {
          part: "snippet",
          q: query,
          type: "video",
          maxResults: 9,
          key: process.env.YOUTUBE_API_KEY,
        },
      }),
      // SerpAPI call for Google web search results
      axios.get("https://serpapi.com/search.json", {
        params: {
          q: query,
          api_key: process.env.SERPAPI_API_KEY,
        },
      }),
    ]);

    const result = {
      query,
      aiAnswer: aiRes.data.choices[0]?.message.content.trim() || "No response",
      videos: ytRes.data.items.map((v) => ({
        title: v.snippet.title,
        videoId: v.id.videoId,
        thumbnail: v.snippet.thumbnails.default.url,
      })),
      webResults: googleRes.data.organic_results.map((r) => ({
        title: r.title,
        url: r.link,
        snippet: r.snippet,
      })),
    };

    res.json(result);
  } catch (error) {
    console.error(
      "Error in search route:",
      error.response?.data || error.message
    );
    res.status(500).json({
      error: "Failed to fetch search results",
      aiAnswer: "Sorry, an error occurred while fetching results.",
      videos: [],
      webResults: [],
    });
  }
});

module.exports = router;
