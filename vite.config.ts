// vite.config.js
// Last updated: 2025-06-21 23:10:36 UTC by jake1318

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { NodeGlobalsPolyfillPlugin } from "@esbuild-plugins/node-globals-polyfill";
import { NodeModulesPolyfillPlugin } from "@esbuild-plugins/node-modules-polyfill";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      process: "process/browser",
      buffer: "buffer/",
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: "globalThis",
        "process.env": "{}",
      },
      plugins: [
        NodeGlobalsPolyfillPlugin({
          process: true,
          buffer: true,
        }),
        NodeModulesPolyfillPlugin(),
      ],
    },
  },
  server: {
    proxy: {
      "/sui": {
        target: "https://rpc.ankr.com/sui",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/sui/, ""),
        configure: (proxy, options) => {
          // Remove the client-request-method header before forwarding.
          proxy.on("proxyReq", (proxyReq, req, res) => {
            proxyReq.removeHeader("client-request-method");
          });
        },
      },
      "/api": {
        target: "http://localhost:5000", // Change this if your backend runs on another port or URL
        changeOrigin: true,
      },
    },
  },
});
