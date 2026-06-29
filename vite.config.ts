import path from "node:path";
import { execSync } from "node:child_process";
import vue from "@vitejs/plugin-vue";
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

function gitShortHash() {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "dev";
  }
}

export default defineConfig({
  define: {
    __GIT_SHORT_HASH__: JSON.stringify(gitShortHash()),
  },
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
