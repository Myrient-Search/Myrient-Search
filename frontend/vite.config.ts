import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // The webtorrent CJS entry pulls in Node-only deps that don't bundle
      // cleanly under Vite/Rollup; alias to the prebuilt browser bundle.
      webtorrent: path.resolve(
        __dirname,
        "./node_modules/webtorrent/dist/webtorrent.min.js",
      ),
    },
  },
  optimizeDeps: {
    exclude: ["webtorrent"],
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
