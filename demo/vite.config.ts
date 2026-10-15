import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  base: "/retouch.js/",
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
