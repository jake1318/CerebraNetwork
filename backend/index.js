// [...path].js
// Last Updated: 2025-08-06 23:15:23 UTC by jake1318

import express from "express";
import axios from "axios";
import rateLimit from "express-rate-limit";
import cors from "cors";
import dotenv from "dotenv";
import searchRouter from "./routes/search.js";
import bluefinRouter from "./routes/bluefin.js";
import swapHistoryRouter from "./routes/swapHistory.js";
import financeRouter from "./routes/finance.js";

dotenv.config();

const app = express();

// API keys - Use standard environment variable names for production
const BIRDEYE_BASE = "https://public-api.birdeye.so";
const BIRDEYE_KEY = process.env.BIRDEYE_API_KEY;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const SERPAPI_API_KEY = process.env.SERPAPI_API_KEY;
const BLOCKVISION_API_KEY = process.env.BLOCKVISION_API_KEY;

// Check critical API keys
console.log("\n🔑 API Key Validation:");

if (!BIRDEYE_KEY) {
  console.error("❌ Missing BIRDEYE_API_KEY in environment variables");
  process.exit(1);
}
console.log("✅ BIRDEYE_API_KEY: Valid");

if (!OPENAI_API_KEY) {
  console.error(
    "❌ Missing OPENAI_API_KEY in environment variables - AI functionality won't work"
  );
  process.exit(1);
}
console.log("✅ OPENAI_API_KEY: Valid");

if (!BLOCKVISION_API_KEY) {
  console.error("❌ Missing BLOCKVISION_API_KEY in environment variables");
  process.exit(1);
}
console.log("✅ BLOCKVISION_API_KEY: Valid");

// Check optional API keys
if (!DEEPSEEK_API_KEY) {
  console.warn(
    "⚠️ Missing DEEPSEEK_API_KEY in environment variables - Deep research will use OpenAI as fallback"
  );
} else {
  console.log("✅ DEEPSEEK_API_KEY: Valid");
}

if (!YOUTUBE_API_KEY) {
  console.warn(
    "⚠️ Missing YOUTUBE_API_KEY in environment variables - Video results won't be available"
  );
} else {
  console.log("✅ YOUTUBE_API_KEY: Valid");
}

if (!SERPAPI_API_KEY || SERPAPI_API_KEY.trim() === "") {
  console.warn(
    "⚠️ Missing or empty SERPAPI_API_KEY in environment variables - Web search results will be simulated using AI"
  );
} else {
  console.log("✅ SERPAPI_API_KEY: Valid");
}

// Log search mode configuration
console.log("\n📋 Search Configuration:");
console.log(
  `  • Standard search: ${OPENAI_API_KEY ? "✓ AI" : "✗ AI"} + ${
    SERPAPI_API_KEY && SERPAPI_API_KEY.trim() !== ""
      ? "✓ Web"
      : "✓ AI-simulated Web"
  } + ${YOUTUBE_API_KEY ? "✓ Videos" : "✗ Videos"}`
);
console.log(
  `  • AI-only search: ${OPENAI_API_KEY ? "✓ Available" : "✗ Not available"}`
);
console.log(
  `  • Deep research: ${
    DEEPSEEK_API_KEY ? "✓ DeepSeek" : "✓ OpenAI fallback"
  }\n`
);

// rate‑limit to 15 requests per second
const birdeyeLimiter = rateLimit({
  windowMs: 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests to Birdeye" },
});

// Bluefin rate limiter - less restrictive
const bluefinLimiter = rateLimit({
  windowMs: 1000,
  max: 30, // Allow more requests per second for Bluefin
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests to Bluefin API" },
});

// 7K API rate limiter
const k7Limiter = rateLimit({
  windowMs: 1000,
  max: 10, // More conservative limit for 7K API
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests to 7K API" },
});

// BlockVision API rate limiter - strict CU limit
const blockVisionLimiter = rateLimit({
  windowMs: 1000,
  max: 5, // Increased to 5 per second for Pro key (300 CU endpoints)
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests to BlockVision API" },
});

// BlockVision batch API rate limiter - allow more requests with Pro key
const blockVisionBatchLimiter = rateLimit({
  windowMs: 1000,
  max: 15, // Allow 15 batch requests per second (15 * 100 CU = 1500 CUPS < 2000 ceiling)
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many batch requests to BlockVision API",
  },
});

// DeepSeek API rate limiter - conservative limit
const deepSeekLimiter = rateLimit({
  windowMs: 10000, // 10 second window
  max: 3, // Max 3 requests per 10 seconds
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests to DeepSeek API",
  },
});

// shared axios client for Birdeye
const birdeye = axios.create({
  baseURL: BIRDEYE_BASE,
  headers: {
    "Content-Type": "application/json",
    "X-API-KEY": BIRDEYE_KEY,
  },
});

// Initialize memory cache for BlockVision responses
const bvCache = new Map();
const CACHE_TTL = 60_000; // 1 minute cache

// Updated CORS configuration to include all necessary frontend domains
const allowedOrigins = [
  "https://www.cerebra.network",
  "https://cerebra.network",
  "https://cerebra-network-e8h5.vercel.app",
  "https://cerebra-network.vercel.app",
  // Include local development URLs if needed
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5173",
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl requests, or server-to-server)
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.indexOf(origin) !== -1) {
      // Origin is allowed
      callback(null, true);
    } else {
      // Log blocked origins for debugging
      console.warn(`CORS blocked origin: ${origin}`);
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "X-API-KEY", "X-Chain", "Authorization"],
  credentials: true,
  maxAge: 86400, // 24 hours - caches preflight request results
};

// Apply CORS middleware
app.use(cors(corsOptions));

// Add explicit OPTIONS handler to ensure preflight requests work correctly
app.options("*", cors(corsOptions));

// Add a logger to see incoming requests for debugging
app.use((req, res, next) => {
  console.log(
    `${new Date().toISOString()} | ${req.method} ${req.path} | Origin: ${
      req.headers.origin || "none"
    }`
  );
  next();
});

app.use(express.json());

// mount the Birdeye proxy under /api
app.use("/api", birdeyeLimiter);

// Apply DeepSeek rate limiter to search route specifically for deep research
app.use("/api/search", (req, res, next) => {
  if (req.query.deep === "true") {
    return deepSeekLimiter(req, res, next);
  }
  next();
});

// mount search under `/api/search`
app.use("/api/search", searchRouter);

// mount Bluefin endpoints under `/api/bluefin` with a separate rate limiter
app.use("/api/bluefin", bluefinLimiter, bluefinRouter);

// mount 7K swap history endpoints under `/api/7k` with its own rate limiter
app.use("/api/7k", k7Limiter, swapHistoryRouter);
// Add this to your existing middleware setup
app.use("/api/finance", financeRouter);

/**
 * Forwards the incoming request to Birdeye under the same query params + x‑chain header
 */
async function forwardToBirdeye(req, res, birdeyePath) {
  const chain = req.header("x-chain") || "sui";
  try {
    const response = await birdeye.get(birdeyePath, {
      headers: { "x-chain": chain },
      params: req.query,
    });
    return res.json(response.data);
  } catch (err) {
    if (err.response?.data) {
      return res.status(err.response.status).json(err.response.data);
    }
    return res.status(500).json({ success: false, message: err.message });
  }
}

// proxy endpoints
app.get("/api/token_trending", (req, res) =>
  forwardToBirdeye(req, res, "/defi/token_trending")
);
app.get("/api/price_volume/single", (req, res) =>
  forwardToBirdeye(req, res, "/defi/price_volume/single")
);
app.get("/api/tokenlist", (req, res) =>
  forwardToBirdeye(req, res, "/defi/tokenlist")
);
app.get("/api/ohlcv", (req, res) => forwardToBirdeye(req, res, "/defi/ohlcv"));
app.get("/api/history_price", (req, res) =>
  forwardToBirdeye(req, res, "/defi/history_price")
);

// Proxy endpoint for BlockVision coin market data with caching
app.get("/api/coin/market/pro", blockVisionLimiter, async (req, res) => {
  try {
    const coinType = req.query.coinType;
    if (!coinType) {
      return res
        .status(400)
        .json({ success: false, message: "coinType parameter is required" });
    }

    // Check cache first
    const cacheKey = `market_pro_${coinType}`;
    const cached = bvCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.log(`Cache hit for ${coinType}`);
      return res.json(cached.data);
    }

    const response = await axios.get(
      `https://api.blockvision.org/v2/sui/coin/market/pro`,
      {
        params: { coinType },
        headers: {
          accept: "application/json",
          "x-api-key": BLOCKVISION_API_KEY,
        },
      }
    );

    // Cache the successful response
    if (response.data.success) {
      bvCache.set(cacheKey, {
        timestamp: Date.now(),
        data: response.data,
      });
    }

    return res.json(response.data);
  } catch (err) {
    // Handle rate limit errors specially
    if (err.response?.status === 429) {
      // Extract retry-after header if available
      const retryAfter = err.response.headers["retry-after"];
      res
        .status(429)
        .header("Retry-After", retryAfter || "5")
        .json({
          success: false,
          message: "Rate limit exceeded",
          retryAfter: retryAfter || 5,
        });
      return;
    }

    if (err.response?.data) {
      return res.status(err.response.status).json(err.response.data);
    }
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Proxy endpoint for BlockVision batch coin prices with caching
app.get("/api/coin/price/batch", blockVisionBatchLimiter, async (req, res) => {
  try {
    const tokenIds = req.query.tokenIds;
    const show24hChange = req.query.show24hChange || "true";

    if (!tokenIds) {
      return res
        .status(400)
        .json({ success: false, message: "tokenIds parameter is required" });
    }

    // Check cache first
    const cacheKey = `price_batch_${tokenIds}_${show24hChange}`;
    const cached = bvCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.log(`Cache hit for batch ${tokenIds.substring(0, 20)}...`);
      return res.json(cached.data);
    }

    const response = await axios.get(
      `https://api.blockvision.org/v2/sui/coin/price/list`,
      {
        params: {
          tokenIds,
          show24hChange,
        },
        headers: {
          accept: "application/json",
          "x-api-key": BLOCKVISION_API_KEY,
        },
      }
    );

    // Cache the successful response
    if (response.data.success) {
      bvCache.set(cacheKey, {
        timestamp: Date.now(),
        data: response.data,
      });
    }

    return res.json(response.data);
  } catch (err) {
    // Handle rate limit errors specially
    if (err.response?.status === 429) {
      // Extract retry-after header if available
      const retryAfter = err.response.headers["retry-after"];
      res
        .status(429)
        .header("Retry-After", retryAfter || "5")
        .json({
          success: false,
          message: "Rate limit exceeded",
          retryAfter: retryAfter || 5,
        });
      return;
    }

    // Handle other errors
    if (err.response?.data) {
      return res.status(err.response.status).json(err.response.data);
    }
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Add a cleanup function to periodically remove old cache entries
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of bvCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      bvCache.delete(key);
    }
  }
}, 60000); // Clean up every minute

// 404 for anything else under /api
app.use("/api/*", (_req, res) =>
  res.status(404).json({ success: false, message: "Not found" })
);

// Export for Vercel serverless deployment
export default app;
