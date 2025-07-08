// server.js
import express from "express";
import axios from "axios";
import rateLimit from "express-rate-limit";
import cors from "cors";
import dotenv from "dotenv";
import searchRouter from "./routes/search.js";
import bluefinRouter from "./routes/bluefin.js"; // Import the Bluefin router

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

const BIRDEYE_BASE = "https://public-api.birdeye.so";
const BIRDEYE_KEY = process.env.VITE_BIRDEYE_API_KEY;

if (!BIRDEYE_KEY) {
  console.error("⚠️  Missing VITE_BIRDEYE_API_KEY in .env");
  process.exit(1);
}

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

// shared axios client for Birdeye
const birdeye = axios.create({
  baseURL: BIRDEYE_BASE,
  headers: {
    "Content-Type": "application/json",
    "X-API-KEY": BIRDEYE_KEY,
  },
});

app.use(cors());
app.use(express.json());

// mount the Birdeye proxy under /api
app.use("/api", birdeyeLimiter);

// mount search under `/api/search`
app.use("/api/search", searchRouter);

// mount Bluefin endpoints under `/api/bluefin` with a separate rate limiter
app.use("/api/bluefin", bluefinLimiter, bluefinRouter);

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

// 404 for anything else under /api
app.use("/api/*", (_req, res) =>
  res.status(404).json({ success: false, message: "Not found" })
);

app.listen(PORT, () => {
  console.log(`🚀 Backend proxy listening on http://localhost:${PORT}`);
});
