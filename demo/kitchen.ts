// Kitchen sink: every token and plugin control in both themes, for visual QA.
// Served by `pnpm dev` at /retouch.js/kitchen.html; not part of the build.

import type { ShellTheme } from "../src/index";
import { Retouch } from "../src/index";
import { injectStyles } from "../src/styles";
import { createToolUi } from "../src/ui/editor/tool-ui";
import { createToastHost } from "../src/ui/toast";
import { paintScene, samplePhotos } from "./samples";

injectStyles();

const THEMES: ShellTheme[] = ["light", "dark", "auto"];
const WORLDS = ["light", "dark"] as const;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...children: Array<Node | string>
): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

/** A `.rt-root` scope, so the tokens of one world resolve inside it. */
function world(theme: ShellTheme, extraStyle = ""): HTMLElement {
  const root = el("div", { className: "rt-root" });
  root.dataset.rtTheme = theme;
  root.style.cssText = `background: var(--rt-surface); padding: 16px; border-radius: 16px; display: grid; gap: 16px; ${extraStyle}`;
  return root;
}

// ── Drop zone and gallery on a light host and a dark one ──

const shells: Retouch[] = [];
const photos = await samplePhotos();
for (const theme of WORLDS) {
  const target = document.getElementById(`shell-${theme}`);
  const seg = document.querySelector<HTMLElement>(`.seg[data-for="${theme}"]`);
  if (!target || !seg) continue;
  const shell = new Retouch({ target, theme, onDone: () => {} });
  void shell.addFiles(photos);
  shells.push(shell);
  for (const option of THEMES) {
    const button = el("button", { type: "button", textContent: option });
    button.setAttribute("aria-pressed", String(option === theme));
    button.addEventListener("click", () => {
      shell.setTheme(option);
      for (const b of seg.querySelectorAll("button")) {
        b.setAttribute("aria-pressed", String(b === button));
      }
    });
    seg.append(button);
  }
}
Object.assign(window, { shells });

// ── Tokens ──

const GROUPS: Array<[string, string[]]> = [
  [
    "Surfaces",
    [
      "--rt-surface",
      "--rt-surface-raised",
      "--rt-surface-overlay",
      "--rt-surface-subtle",
      "--rt-control",
      "--rt-control-hover",
    ],
  ],
  ["Text", ["--rt-text-1", "--rt-text-2", "--rt-text-3", "--rt-text-disabled"]],
  ["Lines", ["--rt-line", "--rt-line-strong", "--rt-line-loud"]],
  [
    "Accent",
    [
      "--rt-accent",
      "--rt-accent-hover",
      "--rt-accent-soft",
      "--rt-accent-glow",
      "--rt-accent-text",
      "--rt-focus",
    ],
  ],
  ["Status", ["--rt-success", "--rt-danger", "--rt-danger-soft", "--rt-danger-text"]],
];

function swatch(token: string): HTMLElement {
  const isText = /text/.test(token);
  const chip = el("div", { className: "chip" });
  chip.style.cssText = isText
    ? `display: grid; place-items: center; font: 600 18px var(--rt-font-ui); color: var(${token})`
    : `background: var(${token})`;
  if (isText) chip.textContent = "Aa";
  return el("div", { className: "swatch" }, chip, token.replace("--rt-", ""));
}

function tokenGroups(root: HTMLElement, groups: Array<[string, string[]]>): void {
  for (const [title, tokens] of groups) {
    const heading = el("h3", { textContent: title });
    heading.style.color = "var(--rt-text-2)";
    root.append(heading, el("div", { className: "swatches" }, ...tokens.map(swatch)));
  }
}

for (const theme of WORLDS) {
  const root = world(theme);
  tokenGroups(root, GROUPS);

  const extras = el("div", { className: "swatches" });
  const prism = el("div", { className: "chip" });
  prism.style.background = "var(--rt-prism)";
  extras.append(el("div", { className: "swatch" }, prism, "prism"));
  for (const level of ["sm", "md", "lg", "float"]) {
    const card = el("div", { className: "chip" });
    card.style.cssText = `background: var(--rt-surface-raised); box-shadow: var(--rt-shadow-${level})`;
    extras.append(el("div", { className: "swatch" }, card, `shadow-${level}`));
  }
  for (const radius of ["sm", "md", "lg", "xl", "full"]) {
    const box = el("div", { className: "chip" });
    box.style.cssText = `background: var(--rt-control-hover); border-radius: var(--rt-radius-${radius})`;
    extras.append(el("div", { className: "swatch" }, box, `radius-${radius}`));
  }
  const type = el("div");
  type.style.cssText = "display: grid; gap: 4px; color: var(--rt-text-1)";
  for (const size of ["xl", "lg", "md", "sm", "xs"]) {
    const line = el("div", { textContent: `type-${size} · Exposure +0.35` });
    line.style.font = `500 var(--rt-type-${size}) var(--rt-font-ui)`;
    type.append(line);
  }
  const mono = el("div", { textContent: "font-mono · 1600 × 1067 · 25 MB" });
  mono.style.font = "var(--rt-type-sm) var(--rt-font-mono)";
  type.append(mono);
  root.append(extras, type);
  document.getElementById("tokens")?.append(root);
}

// ── One-variable branding ──

for (const theme of WORLDS) {
  const root = world(theme, "--rt-accent: #2563EB;");
  tokenGroups(root, [GROUPS[3]]);
  document.getElementById("branding")?.append(root);
}

// ── Plugin controls ──

for (const theme of WORLDS) {
  const root = world(theme);
  const tray = el("div", { className: "tray" });
  tray.style.background = "var(--rt-surface-raised)";
  const ui = createToolUi();
  const note = ui.note("Model ready · 25 MB, cached");
  const toggle = ui.button({
    label: "Toggle",
    active: false,
    onClick: () => {
      const on = toggle.root.getAttribute("aria-pressed") !== "true";
      toggle.setActive(on);
      note.set(on ? "Toggle on" : "Toggle off");
    },
  });
  const nop = (): void => {};
  tray.append(
    ui.section(
      "Light",
      ui.slider({ label: "Exposure", min: -100, max: 100, value: 24, onInput: nop }).root,
      ui.slider({ label: "Grain", min: 0, max: 100, value: 30, onInput: nop }).root,
      ui.slider({
        label: "Temperature",
        min: -100,
        max: 100,
        value: -20,
        track: "linear-gradient(90deg, #3f86ff, #9db4d4 46%, #d9c49c 54%, #ffa53a)",
        onInput: nop,
      }).root,
    ),
    ui.tiles({
      label: "Look",
      options: (["fjord", "forest", "night"] as const).map((scene) => ({
        value: scene,
        label: scene[0].toUpperCase() + scene.slice(1),
        preview: paintScene(scene, 120, 120).toDataURL("image/jpeg", 0.85),
      })),
      value: "forest",
      onChange: (value) => note.set(`Look ${value}`),
    }).root,
    ui.row(
      ui.button({ label: "Default", onClick: nop }).root,
      ui.button({ label: "Primary", variant: "primary", onClick: nop }).root,
      toggle.root,
      ui.button({ label: "Disabled", disabled: true, onClick: nop }).root,
    ),
    ui.row(
      ui.choice({
        label: "Aspect ratio",
        options: [
          { value: "free", label: "Free" },
          { value: "1:1", label: "1:1" },
          { value: "4:3", label: "4:3" },
          { value: "16:9", label: "16:9" },
        ],
        value: "1:1",
        onChange: (value) => note.set(`Aspect ${value}`),
      }).root,
    ),
    ui.row(note.root),
  );
  root.append(tray);
  document.getElementById("controls")?.append(root);
}

// ── Toasts and motion ──

const toasts = createToastHost();
const actions = document.getElementById("actions");
const messages: Array<["error" | "info" | "success", string]> = [
  ["error", "notes.txt — unsupported file type"],
  ["info", "Downloading the model · 12 of 25 MB"],
  ["success", "Cutout added to your gallery"],
];
for (const [kind, message] of messages) {
  actions?.append(
    el("button", {
      type: "button",
      textContent: `Show ${kind}`,
      onclick: () => toasts.show(message, kind),
    }),
  );
}

const track = world("light", "padding: 10px; width: 220px; border-radius: 999px; display: block;");
const dot = el("div");
dot.style.cssText =
  "width: 20px; height: 20px; border-radius: 50%; background: var(--rt-accent); transition: transform var(--rt-dur-4) var(--rt-ease-spring);";
track.append(dot);
let out = false;
actions?.append(
  el("button", {
    type: "button",
    textContent: "Play spring",
    onclick: () => {
      out = !out;
      dot.style.transform = out ? "translateX(180px)" : "none";
    },
  }),
  track,
);
