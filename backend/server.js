require("dotenv").config();
const express = require("express");
const {
  createProxyMiddleware,
  fixRequestBody,
} = require("http-proxy-middleware");
const cors = require("cors");
// Import the pools router with the correct relative path
const poolsRouter = require("./pools"); // Changed from "./backend/pools" to "./pools"

const app = express();
const PORT = process.env.PORT || 5000;

// Use CORS middleware
app.use(cors());

// Parse JSON request bodies
app.use(express.json());

// Mount proxy middleware for Sui fullnode requests
app.use(
  "/sui-proxy",
  createProxyMiddleware({
    target: "https://fullnode.mainnet.sui.io:443", // Fixed URL with colon before port
    changeOrigin: true,
    pathRewrite: {
      "^/sui-proxy": "",
    },
    onProxyReq: fixRequestBody,
    onProxyRes: (proxyRes, req, res) => {
      proxyRes.headers["Access-Control-Allow-Origin"] = "*";
    },
    onError: (err, req, res) => {
      console.error("Proxy error:", err);
      res.status(500).json({ error: "Proxy error", details: err.message });
    },
  })
);

// Mount the pools router to handle pool-related API requests
app.use("/api", poolsRouter);

// Simple health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "Server is running" });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
