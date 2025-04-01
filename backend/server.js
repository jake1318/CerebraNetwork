import "dotenv/config";
import express from "express";
import { createProxyMiddleware, fixRequestBody } from "http-proxy-middleware";
import cors from "cors";
import poolsRouter from "./pools.js";
import searchRouter from "./routes/search.js";

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Proxy middleware for Sui fullnode requests using BlockVision's private RPC endpoint.
app.use(
  "/sui-proxy",
  createProxyMiddleware({
    target: "https://sui-mainnet-endpoint.blockvision.org",
    changeOrigin: true,
    pathRewrite: { "^/sui-proxy": "" },
    headers: {
      "x-api-key": process.env.BLOCKVISION_API_KEY,
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

// Mount routers
app.use("/api/pools", poolsRouter);
app.use("/api/search", searchRouter);

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "Server is running" });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
