// Consumer-side smoke test for the built packages.
//
// The demo aliases `@9tensor/retouch` straight to `src/`, so nothing else in
// the repo ever exercises `dist/` or the package `exports` map. This script
// does, from plain Node: it imports both entry points of both packages, then
// packs each one and inspects the tarball the registry would receive.
//
// Run after `pnpm build:all`.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
let failures = 0;

function check(ok, message) {
  if (ok) {
    console.log(`  ✓ ${message}`);
  } else {
    failures++;
    console.log(`  ✗ ${message}`);
  }
}

async function loadBoth(dir) {
  const esm = await import(pathToFileURL(join(dir, "dist/index.js")).href);
  const cjs = require(join(dir, "dist/index.cjs"));
  return { esm, cjs };
}

const corePkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const mlDir = join(root, "packages/ml");
const mlPkg = JSON.parse(readFileSync(join(mlDir, "package.json"), "utf8"));

console.log(`\n@9tensor/retouch ${corePkg.version}`);
{
  const { esm, cjs } = await loadBoth(root);
  for (const [label, mod] of [
    ["esm", esm],
    ["cjs", cjs],
  ]) {
    check(typeof mod.Retouch === "function", `${label}: exports Retouch`);
    check(typeof mod.refreshRangeFill === "function", `${label}: exports refreshRangeFill`);
    check(
      mod.VERSION === corePkg.version,
      `${label}: VERSION is ${JSON.stringify(mod.VERSION)} (package.json ${corePkg.version})`,
    );
  }
}

console.log(`\n@9tensor/retouch-ml ${mlPkg.version}`);
{
  const { esm, cjs } = await loadBoth(mlDir);
  for (const [label, mod] of [
    ["esm", esm],
    ["cjs", cjs],
  ]) {
    check(typeof mod.installMlTools === "function", `${label}: exports installMlTools`);
    check(typeof mod.removeBackground === "function", `${label}: exports removeBackground`);
  }
}

// ── Tarballs ────────────────────────────────────────────────────────────
// `pnpm pack` applies the same `workspace:` rewriting as `pnpm publish`, so
// the tarball is exactly what the registry would get.

const packDir = mkdtempSync(join(tmpdir(), "retouch-smoke-"));
const REQUIRED_FILES = [
  "package/LICENSE",
  "package/README.md",
  "package/dist/index.js",
  "package/dist/index.cjs",
  "package/dist/index.d.ts",
  "package/dist/index.d.cts",
];

function packAndInspect(dir, name) {
  const output = execFileSync("pnpm", ["pack", "--pack-destination", packDir], {
    cwd: dir,
    encoding: "utf8",
  });
  const tarball = output.trim().split("\n").pop();
  const files = execFileSync("tar", ["-tzf", tarball], { encoding: "utf8" }).trim().split("\n");
  const manifest = JSON.parse(
    execFileSync("tar", ["-xOzf", tarball, "package/package.json"], { encoding: "utf8" }),
  );
  console.log(`\n${name} tarball (${files.length} files)`);
  for (const file of REQUIRED_FILES) check(files.includes(file), `contains ${file}`);
  const raw = JSON.stringify(manifest);
  check(!raw.includes("workspace:"), "no workspace: protocol in package.json");
  return manifest;
}

try {
  packAndInspect(root, "@9tensor/retouch");
  const ml = packAndInspect(mlDir, "@9tensor/retouch-ml");
  const peer = ml.peerDependencies?.["@9tensor/retouch"];
  check(
    peer === `^${corePkg.version}`,
    `peer @9tensor/retouch is ${JSON.stringify(peer)} (expected ^${corePkg.version})`,
  );
} finally {
  rmSync(packDir, { recursive: true, force: true });
}

console.log("");
if (failures > 0) {
  console.error(`smoke: ${failures} check(s) failed`);
  process.exit(1);
}
console.log("smoke: all checks passed");
