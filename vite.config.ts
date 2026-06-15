import path from "node:path";
import vue from "@vitejs/plugin-vue";
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [vue(), cloudflare()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    allowedHosts: ["hashpay.outti.me"],
    host: "0.0.0.0",
    port: 8183,
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
