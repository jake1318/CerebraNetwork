// routes/finance.js
// Last Updated: 2025-07-30 00:53:37 UTC by jake1318

import express from "express";
import { queryFinance, getFinanceNews } from "../services/serpApiFinance.js";
import { fetchRssFeed } from "../services/rssService.js";

const router = express.Router();

const jsonError = (res, status, msg) =>
  res.status(status).json({ success: false, error: msg });

router.get("/quote/:ticker", async (req, res) => {
  try {
    const { ticker } = req.params; // e.g. "GOOGL:NASDAQ"
    // Validate ticker format to prevent abuse
    if (!ticker.match(/^[A-Z0-9.\-:]+$/)) {
      return jsonError(res, 400, "Invalid ticker format");
    }

    const { window, hl, no_cache } = req.query;

    // Create clean options object with only defined values
    const options = {
      q: ticker,
    };

    if (window) options.window = window;
    if (hl) options.hl = hl;
    if (no_cache === "true") options.no_cache = true;

    const data = await queryFinance(options);
    res.json({ success: true, data });
  } catch (e) {
    console.error("Finance route error:", e);
    jsonError(res, 500, e.message);
  }
});

router.get("/news", async (req, res) => {
  try {
    const { q, hl, no_cache, include_rss } = req.query;
    console.log("Received news request with params:", {
      q,
      hl,
      no_cache,
      include_rss,
    });

    // Validate query if provided
    if (q && !q.match(/^[A-Z0-9.\-:]+$/)) {
      return jsonError(res, 400, "Invalid query format");
    }

    console.log(`Processing news request for "${q || "CRYPTO"}"`);

    // Create clean options object with only defined values
    const options = {};
    if (q) options.q = q;
    if (hl) options.hl = hl;
    if (no_cache === "true") options.no_cache = true;

    let newsData = { success: false, news: [] };

    // Check if this is a request specifically for Cointelegraph RSS feed only
    if (q === "COINTELEGRAPH") {
      try {
        const rssData = await fetchRssFeed("https://cointelegraph.com/rss");
        if (rssData.success) {
          return res.json({
            success: true,
            data: {
              query: q,
              news: rssData.news,
              metadata: { source: "cointelegraph_rss" },
            },
          });
        }
      } catch (rssError) {
        console.error("Failed to fetch Cointelegraph RSS:", rssError);
        // Continue with SerpAPI as fallback
      }
    }

    // Get regular news from SerpAPI
    newsData = await getFinanceNews(options);

    // For crypto queries, try to enhance with RSS if requested or default
    if ((q === "CRYPTO" || !q) && include_rss !== "false") {
      try {
        const rssData = await fetchRssFeed("https://cointelegraph.com/rss");
        if (rssData.success && rssData.news.length > 0) {
          // Merge RSS feed news with SerpAPI news
          if (newsData.success && Array.isArray(newsData.news)) {
            // Combined news from both sources, sort by date (newest first)
            const combinedNews = [...rssData.news, ...newsData.news].sort(
              (a, b) => {
                const dateA = new Date(a.isoDate || Date.now());
                const dateB = new Date(b.isoDate || Date.now());
                return dateB - dateA;
              }
            );

            newsData.news = combinedNews;
          } else {
            // If SerpAPI failed, just use RSS news
            newsData.success = true;
            newsData.news = rssData.news;
          }
        }
      } catch (rssError) {
        console.error("Failed to enhance with RSS feed:", rssError);
        // Continue with just SerpAPI results
      }
    }

    console.log(`News API response success: ${newsData.success}`);

    if (newsData.success) {
      // Add more detailed logging about the successful response
      console.log(
        `Returning ${newsData.news?.length || 0} news items for "${
          newsData.query || q || "CRYPTO"
        }"`
      );
      res.json({
        success: true,
        data: {
          query: newsData.query || q || "CRYPTO",
          news: newsData.news || [],
          metadata: newsData.metadata || {},
        },
      });
    } else {
      console.error("Failed to fetch news:", newsData.error);
      jsonError(res, 500, newsData.error || "Failed to fetch news");
    }
  } catch (e) {
    console.error("Finance news route error:", e);
    jsonError(res, 500, e.message);
  }
});

// Dedicated RSS feed endpoint
router.get("/rss", async (req, res) => {
  try {
    const { url } = req.query;

    if (!url || typeof url !== "string") {
      return jsonError(res, 400, "URL parameter is required");
    }

    // Validate URL to prevent abuse
    if (!/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(url)) {
      return jsonError(res, 400, "Invalid URL format");
    }

    const rssData = await fetchRssFeed(url);

    if (rssData.success) {
      res.json({ success: true, data: rssData });
    } else {
      jsonError(res, 500, rssData.error || "Failed to fetch RSS feed");
    }
  } catch (e) {
    console.error("RSS feed route error:", e);
    jsonError(res, 500, e.message);
  }
});

export { router };
export default router;
