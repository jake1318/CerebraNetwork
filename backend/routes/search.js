// routes/search.js - Updated to handle empty SERPAPI_API_KEY
import express from "express";
import axios from "axios";
import rateLimit from "express-rate-limit";

const router = express.Router();

// Middleware to validate Sui wallet address
const validateWallet = (req, res, next) => {
  const walletAddress = req.header("x-wallet-address");

  if (!walletAddress) {
    return res.status(400).json({
      error: "Sui wallet connection required to use search",
    });
  }

  // Sui addresses are 66 characters (with 0x prefix) hex strings (32 bytes + 0x prefix)
  if (!/^0x[a-fA-F0-9]{64}$/.test(walletAddress)) {
    return res.status(400).json({
      error: "Invalid Sui wallet address format",
    });
  }

  // Store wallet address in request for rate limiter to use
  req.walletAddress = walletAddress;
  next();
};

// Create wallet-based rate limiter
const searchRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 5, // limit each wallet to 5 requests per minute
  message: {
    error: "Rate limit exceeded. Please try again later.",
  },
  // Use wallet address as the key for rate limiting instead of IP
  keyGenerator: (req) => req.walletAddress || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
});

// Function to generate web results using AI when SERPAPI is not available
async function generateAIWebResults(query) {
  try {
    const fakeWebResults = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "user",
            content: `Create 5 simulated search results for the query: "${query}"
          
Each result should include:
1. A title (like a webpage title)
2. A URL (make up a plausible URL)
3. A snippet (a brief description of what might be on the page)

Format as JSON:
[
  {
    "title": "Example title",
    "url": "https://example.com/page",
    "snippet": "Brief description of the content..."
  },
  ...
]`,
          },
        ],
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.VITE_OPENAI_API_KEY}`,
        },
      }
    );

    // Parse the JSON string from the AI response
    const responseText =
      fakeWebResults.data.choices?.[0]?.message?.content || "[]";
    try {
      // Extract JSON from the response (handling cases where AI might add markdown formatting)
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      const jsonString = jsonMatch ? jsonMatch[0] : "[]";
      return JSON.parse(jsonString);
    } catch (parseError) {
      console.log("Failed to parse AI web results:", parseError);
      return [];
    }
  } catch (error) {
    console.log("Failed to generate AI web results:", error.message);
    return [];
  }
}

// Apply middleware to all search routes
router.use(validateWallet);
router.use(searchRateLimiter);

router.get("/", async (req, res) => {
  const query = req.query.q;
  const isDeepResearch = req.query.deep === "true";
  const isAiOnly = req.query.aiOnly === "true";
  const videoPage = parseInt(req.query.videoPage) || 1;
  const webPage = parseInt(req.query.webPage) || 1;

  if (!query) {
    return res.status(400).json({ error: 'Query parameter "q" is required' });
  }

  // Log which wallet is making the request (useful for monitoring/debugging)
  console.log(
    `Search request from Sui wallet: ${
      req.walletAddress
    }, query: "${query}", mode: ${
      isDeepResearch ? "deep-research" : isAiOnly ? "ai-only" : "standard"
    }`
  );

  try {
    let result = { query };

    if (isDeepResearch) {
      // Deep research mode - use DeepSeek API if available, otherwise fall back to OpenAI
      try {
        // Try DeepSeek first (if API key exists)
        if (process.env.VITE_DEEPSEEK_API_KEY) {
          const deepSeekRes = await axios.post(
            "https://api.deepseek.com/v1/chat/completions",
            {
              model: "deepseek-reasoner",
              messages: [
                {
                  role: "user",
                  content: `Provide a detailed research answer with reasoning to the following query: ${query}`,
                },
              ],
            },
            {
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${process.env.VITE_DEEPSEEK_API_KEY}`,
              },
            }
          );

          // Extract both reasoning and final answer
          const reasoning =
            deepSeekRes.data.choices?.[0]?.message?.reasoning_content || "";
          const finalAnswer =
            deepSeekRes.data.choices?.[0]?.message?.content || "";

          // Format the response with both reasoning and answer
          result = {
            query,
            aiAnswer: reasoning
              ? `## Reasoning Process\n\n${reasoning}\n\n## Final Answer\n\n${finalAnswer}`
              : finalAnswer.trim() || "No response",
            deepResearch: true,
            aiOnly: false,
            videos: [],
            webResults: [],
          };
        } else {
          throw new Error("DeepSeek API key not available");
        }
      } catch (deepSeekError) {
        console.log(
          "DeepSeek API error, falling back to OpenAI:",
          deepSeekError.message
        );

        // Fall back to OpenAI with a reasoning prompt
        const aiRes = await axios.post(
          "https://api.openai.com/v1/chat/completions",
          {
            model: "gpt-4o",
            messages: [
              {
                role: "user",
                content: `You are an advanced reasoning system. Provide a detailed analysis with your step-by-step reasoning process for the following query: ${query}

Please format your response with:
1. First, provide your reasoning process showing how you think about this question
2. Then, provide your final conclusion or answer

Clearly separate the reasoning process from the final answer.`,
              },
            ],
          },
          {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${process.env.VITE_OPENAI_API_KEY}`,
            },
          }
        );

        const aiAnswer =
          aiRes.data.choices?.[0]?.message?.content.trim() || "No response";

        result = {
          query,
          aiAnswer: aiAnswer,
          deepResearch: true,
          aiOnly: false,
          videos: [],
          webResults: [],
        };
      }
    } else if (isAiOnly) {
      // AI-only mode - only call OpenAI and return the answer
      const aiRes = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model: "gpt-4o",
          messages: [{ role: "user", content: query }],
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.VITE_OPENAI_API_KEY}`,
          },
        }
      );

      result = {
        query,
        aiAnswer:
          aiRes.data.choices?.[0]?.message?.content.trim() || "No response",
        deepResearch: false,
        aiOnly: true,
        videos: [],
        webResults: [],
      };
    } else {
      // Regular search - try to get AI + web + video results
      const promises = [];

      // Always request AI results
      const aiPromise = axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model: "gpt-4o",
          messages: [{ role: "user", content: query }],
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.VITE_OPENAI_API_KEY}`,
          },
        }
      );
      promises.push(aiPromise);

      // YouTube video results if API key available
      let videoPromise = null;
      if (process.env.VITE_YOUTUBE_API_KEY) {
        videoPromise = axios.get(
          "https://www.googleapis.com/youtube/v3/search",
          {
            params: {
              part: "snippet",
              q: query,
              type: "video",
              maxResults: 9,
              pageToken: videoPage > 1 ? req.query.videoPageToken : undefined,
              key: process.env.VITE_YOUTUBE_API_KEY,
            },
          }
        );
        promises.push(videoPromise);
      }

      // Web results from either SerpAPI or AI-generated
      let webResults = [];
      if (req.query.webPage && webPage > 1) {
        // Don't request web results again if this is a pagination request for videos
        // Just use the empty array
      } else if (
        process.env.VITE_SERPAPI_API_KEY &&
        process.env.VITE_SERPAPI_API_KEY.trim() !== ""
      ) {
        try {
          const googleRes = await axios.get("https://serpapi.com/search.json", {
            params: {
              q: query,
              api_key: process.env.VITE_SERPAPI_API_KEY,
            },
          });

          webResults = (googleRes.data.organic_results || []).map((r) => ({
            title: r.title,
            url: r.link,
            snippet: r.snippet,
          }));
        } catch (serpError) {
          console.log(
            "SerpAPI error, falling back to AI-generated web results:",
            serpError.message
          );
          webResults = await generateAIWebResults(query);
        }
      } else {
        console.log(
          "SERPAPI_API_KEY is missing or empty, using AI-generated web results"
        );
        webResults = await generateAIWebResults(query);
      }

      // Wait for AI and YouTube promises to resolve
      const results = await Promise.all(promises);
      const aiRes = results[0];
      let videos = [];

      if (videoPromise) {
        const ytRes = results[1];
        videos = (ytRes.data.items || []).map((v) => ({
          title: v.snippet.title,
          videoId: v.id.videoId,
          thumbnail:
            v.snippet.thumbnails.medium?.url ||
            v.snippet.thumbnails.default?.url,
          channel: v.snippet.channelTitle,
        }));
      }

      result = {
        query,
        aiAnswer:
          aiRes.data.choices?.[0]?.message?.content.trim() || "No response",
        deepResearch: false,
        aiOnly: false,
        videos: videos,
        webResults: webResults,
      };
    }

    res.json(result);
  } catch (error) {
    console.error(
      "Error in search route:",
      error.response?.data || error.message
    );
    res.status(500).json({
      error: "Failed to fetch search results",
      aiAnswer:
        "Sorry, an error occurred while fetching results. Please try again later.",
      deepResearch: isDeepResearch,
      aiOnly: isAiOnly,
      videos: [],
      webResults: [],
    });
  }
});

export default router;
