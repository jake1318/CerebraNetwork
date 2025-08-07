// services/serpApiFinance.js
// Last Updated: 2025-08-04 01:22:18 UTC by jake1318

import fetch from "node-fetch";
import dotenv from "dotenv";

// Load environment variables directly in this file
dotenv.config();

const API_ENDPOINT = "https://serpapi.com/search.json";

// Check for both environment variable formats
const apiKey = process.env.VITE_SERPAPI_API_KEY || process.env.SERPAPI_API_KEY;

// Add logging to debug the environment variable status
console.log("Environment check:", {
  "VITE_SERPAPI_API_KEY exists": process.env.VITE_SERPAPI_API_KEY
    ? "Yes"
    : "No",
  "SERPAPI_API_KEY exists": process.env.SERPAPI_API_KEY ? "Yes" : "No",
});

// Verify API key exists
if (!apiKey) {
  console.error(
    "ERROR: No SerpAPI key found in environment variables. Please set VITE_SERPAPI_API_KEY in your .env file."
  );
  throw new Error(
    "Missing required API key for SerpAPI. Check environment variables."
  );
}

/**
 * Query Google Finance via SerpApi.
 *
 * @param {Object} opts
 *   q          – (required) e.g. "AAPL:NASDAQ", "BTC-USD"
 *   hl         – locale (optional, default .env)
 *   window     – 1D|5D|1M|… (optional, default .env)
 *   no_cache   – boolean (optional)
 *   async      – boolean (optional; we default to synchronous)
 */
export async function queryFinance(opts) {
  const params = {
    engine: "google_finance",
    api_key: apiKey,
    hl: process.env.SERPAPI_DEFAULT_LOCALE || "en",
    window: process.env.SERPAPI_DEFAULT_WINDOW || "1D",
    ...opts,
  };
  const qs = new URLSearchParams(params).toString();
  // Hide API key from logs
  const sanitizedQs = qs.replace(/api_key=[^&]+/, "api_key=REDACTED");
  const url = `${API_ENDPOINT}?${qs}`;
  const sanitizedUrl = `${API_ENDPOINT}?${sanitizedQs}`;

  console.log(`Making SerpAPI request: ${sanitizedUrl}`);

  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SerpApi ${res.status}: ${text}`);
  }
  return res.json(); // structured JSON
}

/**
 * Get financial news from SerpApi using Google search engine.
 * This uses the standard Google search engine with finance terms to get financial news.
 *
 * @param {Object} opts
 *   q          - (optional) ticker or keyword to search news for, e.g. "CRYPTO", "SUI", "BTC-USD"
 *   hl         – locale (optional, default .env)
 *   no_cache   – boolean (optional)
 * @returns {Promise<Object>} - News data structure
 */
export async function getFinanceNews(opts = {}) {
  // Make sure we have a default locale even if the env variable is undefined
  const defaultLocale = process.env.SERPAPI_DEFAULT_LOCALE || "en";

  // If no specific ticker is provided, default to crypto news
  const query = opts.q || "CRYPTO";

  // For news, we need to use the standard Google search engine with news tabs
  const params = {
    // Use Google search engine instead of google_finance
    engine: "google",
    api_key: apiKey,
    // Ensure hl is ALWAYS set to a string value, never undefined
    hl: defaultLocale,
    q: `${query} finance news`, // Format query for better news results
    tbm: "nws", // This parameter tells Google to show news results
    num: 20, // Number of results to return
  };

  // Only add optional parameters if they are defined
  if (opts.no_cache) {
    params.no_cache = opts.no_cache;
  }

  console.log("Finance news params:", {
    engine: params.engine,
    hl: params.hl,
    q: params.q,
    tbm: params.tbm,
  });

  const qs = new URLSearchParams(params).toString();
  // Hide API key from logs
  const sanitizedQs = qs.replace(/api_key=[^&]+/, "api_key=REDACTED");
  const url = `${API_ENDPOINT}?${qs}`;
  const sanitizedUrl = `${API_ENDPOINT}?${sanitizedQs}`;

  try {
    console.log(`Sending request to SerpAPI: ${sanitizedUrl}`);
    const res = await fetch(url, { method: "GET" });

    if (!res.ok) {
      const text = await res.text();
      console.error(`SerpAPI error response (${res.status}):`, text);
      throw new Error(`SerpApi ${res.status}: ${text}`);
    }

    const data = await res.json();
    console.log(`SerpAPI response received, status: ${res.status}`);

    // Log more details about the structure of the response
    console.log("Response data keys:", Object.keys(data));

    // With Google search engine + tbm=nws, we should get "news_results"
    if (data && data.news_results && Array.isArray(data.news_results)) {
      console.log(`Found ${data.news_results.length} news items`);

      // Log the format of the first news item's date for debugging
      if (data.news_results.length > 0) {
        console.log("Sample news item date format:", data.news_results[0].date);
        console.log(
          "First news item:",
          JSON.stringify(data.news_results[0], null, 2)
        );
      }

      // Process the news results to format dates properly
      const processedNews = data.news_results.map((item) => {
        // Convert relative dates (like "2 days ago") to actual dates
        let formattedDate = item.date;

        // Log each date for debugging
        console.log(`Original date: "${item.date}"`);

        return {
          ...item,
          date: formattedDate,
          // Add an ISO date property that will be easier for the frontend to work with
          isoDate: new Date().toISOString(),
        };
      });

      return {
        success: true,
        query: params.q,
        news: processedNews,
        metadata: data.search_metadata,
      };
    } else if (
      data &&
      data.organic_results &&
      Array.isArray(data.organic_results)
    ) {
      // Alternative - use organic results if news_results isn't available
      console.log(`Found ${data.organic_results.length} organic results`);
      return {
        success: true,
        query: params.q,
        news: data.organic_results.map((result) => ({
          position: result.position,
          title: result.title,
          link: result.link,
          source: result.source || "Unknown Source",
          date: result.date || "Recent",
          isoDate: new Date().toISOString(), // Add ISO date for frontend
          snippet: result.snippet || "",
          thumbnail: result.thumbnail ? result.thumbnail : null,
        })),
        metadata: data.search_metadata,
      };
    } else {
      console.error("No news or organic results found in API response");
      // Return the full response for debugging
      return {
        success: false,
        error: "No news data found in the API response",
        metadata: data.search_metadata || {},
        debug: {
          responseKeys: Object.keys(data),
          hasNewsResults: !!data.news_results,
          hasOrganicResults: !!data.organic_results,
        },
      };
    }
  } catch (error) {
    console.error("Error fetching finance news:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}
