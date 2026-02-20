import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: {
    compilerOptions: {
      rootDir: "src",
    },
  },
  tsconfig: "tsconfig.build.json",
  platform: "browser",
  target: "es2022",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  splitting: false,
  minify: false,
  treeshake: true,
});
