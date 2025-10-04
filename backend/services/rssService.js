// services/rssService.js
// Last Updated: 2025-07-30 00:53:37 UTC by jake1318

import fetch from "node-fetch";
import Parser from "rss-parser";
import NodeCache from "node-cache";

// Create a new RSS parser
const parser = new Parser({
  customFields: {
    item: [
      ["media:content", "mediaContent", { keepArray: true }],
      ["content:encoded", "contentEncoded"],
    ],
  },
});

// Create a cache with 15 minute TTL
const rssCache = new NodeCache({ stdTTL: 15 * 60 });

/**
 * Fetches and parses an RSS feed, with caching
 * @param {string} url - The URL of the RSS feed
 * @returns {Promise<Object>} - The parsed feed data
 */
export async function fetchRssFeed(url) {
  try {
    // Check cache first
    const cacheKey = `rss_${url}`;
    const cachedData = rssCache.get(cacheKey);

    if (cachedData) {
      console.log(`Using cached RSS data for ${url}`);
      return cachedData;
    }

    console.log(`Fetching RSS feed from ${url}`);

    // Fetch the RSS feed
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; Cerebra/1.0; +https://cerebranetwork.com)",
      },
      timeout: 10000, // 10 second timeout
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch RSS feed: ${response.statusText}`);
    }

    // Get the XML content
    const xml = await response.text();

    // Parse the XML
    const feed = await parser.parseString(xml);

    // Transform the feed items to match our news format
    const news = feed.items.map((item) => {
      // Extract thumbnail from media:content or from HTML content
      let thumbnail = null;

      if (item.mediaContent && item.mediaContent.length > 0) {
        for (const media of item.mediaContent) {
          if (media.$ && media.$.url && media.$.medium === "image") {
            thumbnail = media.$.url;
            break;
          }
        }
      }

      // If no media:content thumbnail, try to extract from content
      if (!thumbnail && item.contentEncoded) {
        const imgMatch = item.contentEncoded.match(/<img[^>]+src="([^">]+)"/i);
        if (imgMatch && imgMatch[1]) {
          thumbnail = imgMatch[1];
        }
      }

      // If still no thumbnail, try regular content
      if (!thumbnail && item.content) {
        const imgMatch = item.content.match(/<img[^>]+src="([^">]+)"/i);
        if (imgMatch && imgMatch[1]) {
          thumbnail = imgMatch[1];
        }
      }

      // Create a standardized news item
      return {
        position: 0, // Not applicable for RSS
        title: item.title || "",
        link: item.link || "",
        source: feed.title || "Cointelegraph",
        date: item.pubDate || new Date().toISOString(),
        isoDate: item.isoDate || new Date().toISOString(),
        snippet: item.contentSnippet || "",
        thumbnail: thumbnail,
        favicon: feed.favicon || null,
        rss: true, // Mark as coming from RSS feed
      };
    });

    const result = {
      success: true,
      news: news,
      feedTitle: feed.title,
      feedDescription: feed.description,
    };

    // Cache the result
    rssCache.set(cacheKey, result);

    return result;
  } catch (error) {
    console.error("RSS feed error:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}
