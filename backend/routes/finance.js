// routes/finance.js
// Last Updated: 2025-07-12 21:31:15 UTC by jake1318

import express from "express";
import { queryFinance, getFinanceNews } from "../services/serpApiFinance.js";

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
    const { q, hl, no_cache } = req.query;
    console.log("Received news request with params:", { q, hl, no_cache });

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

    const newsData = await getFinanceNews(options);

    console.log(`News API response success: ${newsData.success}`);

    if (newsData.success) {
      // Add more detailed logging about the successful response
      console.log(
        `Returning ${newsData.news?.length || 0} news items for "${
          newsData.query
        }"`
      );
      res.json({ success: true, data: newsData });
    } else {
      console.error("Failed to fetch news:", newsData.error);
      jsonError(res, 500, newsData.error || "Failed to fetch news");
    }
  } catch (e) {
    console.error("Finance news route error:", e);
    jsonError(res, 500, e.message);
  }
});

export { router };
export default router;
