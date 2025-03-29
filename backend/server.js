require("dotenv").config();
const express = require("express");
const {
  createProxyMiddleware,
  fixRequestBody,
} = require("http-proxy-middleware");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 5000;

// Use CORS middleware
app.use(cors());

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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
