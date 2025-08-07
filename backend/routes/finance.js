// routes/finance.js
// Last Updated: 2025-08-04 01:36:57 UTC by jake1318

import express from "express";
import { URL } from "url";
import rateLimit from "express-rate-limit";
import { queryFinance, getFinanceNews } from "../services/serpApiFinance.js";
import { fetchRssFeed } from "../services/rssService.js";

const router = express.Router();

const jsonError = (res, status, msg) =>
  res.status(status).json({ success: false, error: msg });

// Rate limiter for RSS endpoint to prevent abuse
const rssRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // limit each IP to 10 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "Too many requests, please try again later",
  },
});

// List of allowed RSS feed domains
const ALLOWED_RSS_DOMAINS = [
  "coindesk.com",
  "cointelegraph.com",
  "news.bitcoin.com",
  "cryptonews.com",
  "theblockcrypto.com",
  "decrypt.co",
  "finance.yahoo.com",
  "investing.com",
  "bloomberg.com",
  "cnbc.com",
  "ft.com",
  "wsj.com",
  "reuters.com",
  "forbes.com",
  "marketwatch.com",
  "investors.com",
  "barrons.com",
  "businessinsider.com",
  // Add other legitimate financial news sites as needed
];

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

// Helper function to check if a domain is in the allowed list
function isDomainAllowed(hostname) {
  hostname = hostname.toLowerCase();
  return ALLOWED_RSS_DOMAINS.some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
  );
}

// Helper function to check if an IP address or hostname refers to a private network
function isPrivateHostname(hostname) {
  // Check for localhost and variants
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  ) {
    return true;
  }

  // Check for private IP ranges
  const privateIPRanges = [
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/, // 10.0.0.0/8
    /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/, // 172.16.0.0/12
    /^192\.168\.\d{1,3}\.\d{1,3}$/, // 192.168.0.0/16
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/, // 127.0.0.0/8
    /^169\.254\.\d{1,3}\.\d{1,3}$/, // 169.254.0.0/16
    /^fc00::/, // fc00::/7 (Unique Local IPv6)
    /^fe80::/, // fe80::/10 (Link Local IPv6)
  ];

  // Check if hostname is an IP address matching private ranges
  return privateIPRanges.some((pattern) => pattern.test(hostname));
}

// Dedicated RSS feed endpoint with rate limiting and security
router.get("/rss", rssRateLimiter, async (req, res) => {
  try {
    const { url } = req.query;

    if (!url || typeof url !== "string") {
      return jsonError(res, 400, "URL parameter is required");
    }

    // Ensure URL starts with http:// or https://
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      return jsonError(res, 400, "URL must start with http:// or https://");
    }

    // Parse and validate the URL
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch (error) {
      return jsonError(res, 400, "Invalid URL format");
    }

    // Block access to private networks and localhost
    if (isPrivateHostname(parsedUrl.hostname)) {
      console.warn(
        `Blocked RSS request to private network: ${parsedUrl.hostname}`
      );
      return jsonError(res, 403, "Access to internal networks is forbidden");
    }

    // Check against allowlist of domains
    if (!isDomainAllowed(parsedUrl.hostname)) {
      console.warn(
        `Blocked RSS request to non-allowed domain: ${parsedUrl.hostname}`
      );
      return jsonError(
        res,
        403,
        "This domain is not in the allowed list for RSS feeds"
      );
    }

    console.log(`Fetching RSS from allowed domain: ${parsedUrl.hostname}`);
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
