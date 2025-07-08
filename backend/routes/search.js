// routes/search.js
import express from "express";
import axios from "axios";

const router = express.Router();

router.get("/", async (req, res) => {
  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ error: 'Query parameter "q" is required' });
  }

  try {
    const [aiRes, ytRes, googleRes] = await Promise.all([
      // OpenAI GPT-4O (no max_tokens → full-length answers up to context limit)
      axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model: "gpt-4o",
          messages: [{ role: "user", content: query }],
          // max_tokens removed to allow full-length output
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          },
        }
      ),

      // YouTube Data API
      axios.get("https://www.googleapis.com/youtube/v3/search", {
        params: {
          part: "snippet",
          q: query,
          type: "video",
          maxResults: 9,
          key: process.env.YOUTUBE_API_KEY,
        },
      }),

      // SerpAPI Google results
      axios.get("https://serpapi.com/search.json", {
        params: {
          q: query,
          api_key: process.env.SERPAPI_API_KEY,
        },
      }),
    ]);

    const result = {
      query,
      aiAnswer:
        aiRes.data.choices?.[0]?.message?.content.trim() || "No response",
      videos: (ytRes.data.items || []).map((v) => ({
        title: v.snippet.title,
        videoId: v.id.videoId,
        thumbnail: v.snippet.thumbnails.default.url,
      })),
      webResults: (googleRes.data.organic_results || []).map((r) => ({
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

export default router;
