import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  base: "/retouch.js/",
  build: {
    outDir: "../demo-dist",
    emptyOutDir: true,
  },
});
