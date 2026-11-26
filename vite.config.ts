import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";
export default defineConfig({
  plugins: [vue()],
  base: "./",
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  build: {
    outDir: "build/webui/public",
    emptyOutDir: true,
    target: "es2022",
  },
  server: {
    proxy: {
      "/api": {
        target: process.env.QBIT_URL || "http://127.0.0.1:8080",
        changeOrigin: true,
      },
    },
  },
  test: { environment: "jsdom", setupFiles: ["./tests/setup.ts"] },
});
