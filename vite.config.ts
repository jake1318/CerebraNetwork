import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
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
    },
  },
  resolve: {
    alias: {
      "@mysten/sui": path.resolve(
        __dirname,
        "node_modules/@mysten/sui/dist/index.js"
      ),
    },
  },
  optimizeDeps: {
    exclude: ["@mysten/sui"],
  },
});
