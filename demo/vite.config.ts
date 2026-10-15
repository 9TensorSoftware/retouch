import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  // Served from the root of retouch.9tensor.com (GitHub Pages custom domain).
  base: "/",
  resolve: {
    alias: {
      "@9tensor/retouch": fileURLToPath(new URL("../src/index.ts", import.meta.url)),
    },
  },
  build: {
    outDir: "../demo-dist",
    emptyOutDir: true,
  },
});
