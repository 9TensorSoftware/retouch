// Captures the README screenshots from a running demo with headless Chrome,
// over the DevTools protocol, so there's nothing to install.
//
//   pnpm dev                              # in another terminal
//   node scripts/screenshots.mjs [url]    # default http://localhost:5173/
//
// Writes .github/screenshots/*.webp. Set CHROME to use another browser binary.

import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.argv[2] ?? "http://localhost:5173/";
const OUT = new URL("../.github/screenshots/", import.meta.url);
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9333;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Press a key on the page, as the editor's shortcuts hear it. */
const press = (key) =>
  `document.dispatchEvent(new KeyboardEvent("keydown", { key: ${JSON.stringify(key)}, bubbles: true }));`;

const SHOTS = [
  {
    // The hero photo on Adjust, with its settings and the before/after divider
    name: "editor",
    width: 1440,
    height: 900,
    setup: `
      document.querySelector('[data-edit="pond"]').click();
      await sleep(2500);
      ${press("\\")}
      await sleep(800);
    `,
  },
  {
    // The AI tools menu over the corgi, with Depth's model card in the inspector
    name: "ai",
    width: 1440,
    height: 900,
    setup: `
      document.querySelector('[data-edit="corgi"]').click();
      await sleep(2500);
      ${press("i")}
      await sleep(800);
    `,
  },
  {
    // The contact sheet, as the landing page shows it
    name: "gallery",
    width: 1440,
    height: 900,
    dark: true,
    setup: `
      const frame = document.querySelector(".try__frame");
      window.scrollTo(0, frame.getBoundingClientRect().top + scrollY - 24);
      await sleep(800);
    `,
    clip: `(() => {
      const r = document.querySelector(".try__frame").getBoundingClientRect();
      return { x: r.x, y: r.y + scrollY, width: r.width, height: r.height, scale: 1 };
    })()`,
  },
  {
    // A phone: the stage, the controls in the bottom sheet, the tools along the edge
    name: "phone",
    width: 390,
    height: 844,
    scale: 2,
    mobile: true,
    setup: `
      document.querySelector('[data-edit="pond"]').click();
      await sleep(3000);
    `,
  },
];

async function launch() {
  const profile = mkdtempSync(join(tmpdir(), "retouch-shots-"));
  const chrome = spawn(
    CHROME,
    [
      "--headless=new",
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${profile}`,
      "--hide-scrollbars",
      "--force-color-profile=srgb",
      "--no-first-run",
      "--no-default-browser-check",
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  for (let i = 0; i < 50; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = targets.find((target) => target.type === "page");
      if (page) return { chrome, profile, url: page.webSocketDebuggerUrl };
    } catch {
      // Not listening yet
    }
    await sleep(200);
  }
  chrome.kill();
  throw new Error(`Chrome didn't start (${CHROME})`);
}

function connect(url) {
  const ws = new WebSocket(url);
  let next = 0;
  const pending = new Map();
  const listeners = new Set();
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    const waiting = pending.get(message.id);
    if (waiting) {
      pending.delete(message.id);
      if (message.error) waiting.reject(new Error(message.error.message));
      else waiting.resolve(message.result);
    } else {
      for (const listener of listeners) listener(message);
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++next;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const once = (method) =>
    new Promise((resolve) => {
      const listener = (message) => {
        if (message.method !== method) return;
        listeners.delete(listener);
        resolve(message.params);
      };
      listeners.add(listener);
    });
  return new Promise((resolve, reject) => {
    ws.addEventListener("open", () => resolve({ send, once, close: () => ws.close() }));
    ws.addEventListener("error", () => reject(new Error("DevTools connection failed")));
  });
}

async function evaluate(cdp, expression) {
  const { result, exceptionDetails } = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (exceptionDetails) {
    throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
  }
  return result.value;
}

async function capture(cdp, shot) {
  const { width, height, scale = 1.5, mobile = false, dark = false } = shot;
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: scale,
    mobile,
  });
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: mobile });
  // Reduced motion skips the entrance animations, so every shot is settled
  await cdp.send("Emulation.setEmulatedMedia", {
    features: [
      { name: "prefers-color-scheme", value: dark ? "dark" : "light" },
      { name: "prefers-reduced-motion", value: "reduce" },
    ],
  });
  const loaded = cdp.once("Page.loadEventFired");
  await cdp.send("Page.navigate", { url: BASE });
  await loaded;
  // The demo puts its five sample photos in the gallery on load
  await evaluate(
    cdp,
    `new Promise((resolve) => {
      const ready = () => (window.editor?.getMedia().length >= 5 ? resolve() : setTimeout(ready, 100));
      ready();
    })`,
  );
  await evaluate(
    cdp,
    `(async () => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      ${shot.setup ?? ""}
    })()`,
  );
  const { data } = await cdp.send("Page.captureScreenshot", {
    format: "webp",
    quality: 80,
    ...(shot.clip ? { clip: await evaluate(cdp, shot.clip) } : {}),
  });
  writeFileSync(new URL(`${shot.name}.webp`, OUT), Buffer.from(data, "base64"));
  console.log(`✓ ${shot.name}.webp`);
}

mkdirSync(OUT, { recursive: true });
const { chrome, profile, url } = await launch();
try {
  const cdp = await connect(url);
  await cdp.send("Page.enable");
  const only = new Set(process.argv.slice(3));
  for (const shot of SHOTS) if (only.size === 0 || only.has(shot.name)) await capture(cdp, shot);
  cdp.close();
} finally {
  chrome.kill();
  rmSync(profile, { recursive: true, force: true });
}
