import { defineConfig } from "vite";

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
      "/api": {
        target: "http://localhost:5000", // Change this if your backend runs on another port or URL
        changeOrigin: true,
      },
    },
  },
});
