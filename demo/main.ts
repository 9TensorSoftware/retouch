import {
  detectObjects,
  installMlTools,
  linesToText,
  recognizeText,
} from "../packages/ml/src/index";
import type { EditorTool, ToolContext } from "../src/index";
import { Retouch, VERSION } from "../src/index";
import {
  ICON_CHECK,
  ICON_DOWNLOAD,
  ICON_SPARKLE,
  ICON_TOOL_CROP,
  ICON_TOOL_LIQUIFY,
  ICON_TOOL_MASKS,
  ICON_TOOL_STYLIZE,
  ICON_TOOL_TRANSFORM,
  ICON_TOOL_TRIM,
} from "../src/ui/icons";
import { mountCompare } from "./compare";
import { detectionItems, type LabItem, mountLab, textItems, withBounds } from "./labs";
import {
  describe,
  GALLERY,
  LOOKS,
  type Look,
  PHOTOS,
  type PhotoName,
  POND_EDIT,
  type Recipe,
  ROAD_EDIT,
} from "./photos";
import { decoded, lookRecipe, recipeEdits, render, toObjectUrl } from "./render";
import { LONDON_OBJECTS, SIGNPOST_TEXT } from "./showcase";

const BASE = import.meta.env.BASE_URL;
const photoUrl = (name: PhotoName) => `${BASE}photos/${PHOTOS[name].file}`;

function $<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing ${selector}`);
  return element;
}

// ── Demo of the plugin API: a custom "Looks" feature group ──────────────
// One-tap moods that write through the same non-destructive edit model the
// built-in tools use, so previews, undo, and export all work unchanged.

Retouch.registerTool({
  id: "looks",
  label: "Looks",
  group: "looks",
  shortcut: "o",
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l2.5 5.5L20 11l-5.5 2.5L12 19l-2.5-5.5L4 11l5.5-2.5L12 3z"/></svg>',
  mount(ctx: ToolContext) {
    // A look replaces the filter and layers its adjustments on the current ones.
    const editsFor = (look: Look) => ({
      filter: look.filter,
      adjustments: { ...ctx.edits.adjustments, ...look.adjustments },
    });
    // ctx.ui builds controls that match the built-in tools, and ctx.preview
    // draws each tile from the photo itself, so the plugin styles nothing.
    const tiles = ctx.ui.tiles({
      label: "Look",
      options: LOOKS.map((look) => ({
        value: look.name,
        label: look.name,
        preview: ctx.preview(editsFor(look)),
      })),
      value: null,
      onChange: (name) => {
        const look = LOOKS.find((l) => l.name === name);
        if (!look) return;
        Object.assign(ctx.edits, editsFor(look));
        ctx.render(); // also syncs this pane, clearing the selection…
        ctx.record();
        tiles.set(name); // …so mark the look just applied
      },
    });
    return {
      root: tiles.root,
      // Previews follow the photo's current state each time the pane opens.
      onActivate: () => {
        for (const look of LOOKS) tiles.setPreview(look.name, ctx.preview(editsFor(look)));
      },
      sync: () => tiles.set(null),
    };
  },
});

// ── The editor, with the sample photos already in the gallery ───────────

const editor = new Retouch({
  target: "#editor",
  theme: "dark",
  // The rail opens as a list: group titles and tool names beside the icons.
  rail: { expanded: true },
  // Visitors can paste their own Anthropic key to try the AI command bar.
  ai: { allowUserKey: true },
  onDone: saveAll,
});

// ML tools (on-device, lazy model download on first use)
installMlTools(editor);

/** Fetch the sample photos into the gallery; resolves to each one's entry id. */
async function loadSamples(): Promise<Map<PhotoName, string>> {
  const files = await Promise.all(
    GALLERY.map(async (name) => {
      const response = await fetch(photoUrl(name));
      if (!response.ok) throw new Error(`Couldn't load ${PHOTOS[name].file}`);
      const blob = await response.blob();
      return new File([blob], PHOTOS[name].file, { type: blob.type || "image/jpeg" });
    }),
  );
  await editor.addFiles(files);
  const ids = new Map<PhotoName, string>();
  for (const entry of editor.getMedia()) {
    const name = GALLERY.find((n) => PHOTOS[n].file === entry.file.name);
    if (name && !ids.has(name)) ids.set(name, entry.id);
  }
  return ids;
}

const samples = loadSamples();
samples.catch((error) => console.error("[Rétouch demo]", error));

/** The tool each photo opens on: the one it shows off. */
const OPEN_ON: Record<PhotoName, EditorTool> = {
  pond: "adjust",
  road: "hsl",
  portrait: "cutout",
  corgi: "select",
  beach: "erase",
  london: "detect",
  signpost: "text",
};

/** The edits the page shows these photos with, so the sliders explain the picture. */
const RECIPES: Partial<Record<PhotoName, Recipe>> = { pond: POND_EDIT, road: ROAD_EDIT };

/** The gallery entry for a sample, adding the photo first if the gallery doesn't have it. */
async function sampleEntry(name: PhotoName): Promise<string | undefined> {
  const ids = await samples;
  const known = ids.get(name);
  if (known && editor.getMedia().some((entry) => entry.id === known)) return known;
  const response = await fetch(photoUrl(name));
  if (!response.ok) return undefined;
  const blob = await response.blob();
  const before = new Set(editor.getMedia().map((entry) => entry.id));
  await editor.addFiles([new File([blob], PHOTOS[name].file, { type: blob.type || "image/jpeg" })]);
  const added = editor.getMedia().find((entry) => !before.has(entry.id));
  if (added) ids.set(name, added.id);
  return added?.id;
}

/** Open a sample in the editor, on its tool and, until it's been edited, its recipe. */
async function editSample(name: PhotoName): Promise<void> {
  const id = await sampleEntry(name);
  const entry = editor.getImages().find((e) => e.id === id);
  if (!entry) return;
  const recipe = RECIPES[name];
  if (recipe && !entry.edited) Object.assign(entry.edits, recipeEdits(recipe));
  editor.openEditor(entry.id, { tool: OPEN_ON[name] });
}

for (const button of document.querySelectorAll<HTMLButtonElement>("[data-edit]")) {
  button.addEventListener("click", () => void editSample(button.dataset.edit as PhotoName));
}

// "Open your photos": one photo goes straight into the editor, more land in
// the gallery.
const fileInput = $<HTMLInputElement>("#file-input");
$("[data-open-files]").addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", async () => {
  const files = [...(fileInput.files ?? [])];
  fileInput.value = "";
  if (files.length === 0) return;
  await samples.catch(() => undefined);
  const before = new Set(editor.getMedia().map((entry) => entry.id));
  await editor.addFiles(files);
  const added = editor.getMedia().filter((entry) => !before.has(entry.id));
  if (added.length === 1) editor.openEditor(added[0].id);
  else if (added.length > 1) $("#try").scrollIntoView({ block: "start" });
});

/** Done in the gallery saves every photo, edits applied. */
function saveAll(blobs: Blob[]): void {
  const media = editor.getMedia();
  blobs.forEach((blob, i) => {
    const stem = (media[i]?.file.name ?? `photo-${i + 1}`).replace(/\.[^.]+$/, "");
    const ext =
      blob.type.split("/")[1]?.replace("jpeg", "jpg").replace("quicktime", "mov") ?? "jpg";
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${stem}-retouched.${ext}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 60_000);
  });
}

// ── Sections render when they come near the viewport ────────────────────

function whenNear(element: Element, run: () => void): void {
  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      run();
    },
    { rootMargin: "600px 0px" },
  );
  observer.observe(element);
}

function chips(target: HTMLElement, labels: string[]): void {
  target.replaceChildren(
    ...labels.map((label) => {
      const chip = document.createElement("span");
      chip.textContent = label;
      return chip;
    }),
  );
}

// Light on the pond, edited live by the same renderer the editor uses.
const pondFigure = $("#pond-compare");
const pondCompare = mountCompare(pondFigure);
chips($("#pond-recipe"), describe(POND_EDIT));
whenNear(pondFigure, async () => {
  const before = await decoded($<HTMLImageElement>("#pond-before"));
  const after = $<HTMLImageElement>("#pond-after");
  after.src = await toObjectUrl(render(before, POND_EDIT, 2000));
  await decoded(after);
  pondCompare.reveal();
});

// Color mix on the road.
const roadFigure = $("#road-compare");
const roadCompare = mountCompare(roadFigure);
chips($("#road-recipe"), describe(ROAD_EDIT));
whenNear(roadFigure, async () => {
  const before = await decoded($<HTMLImageElement>("#road-before"));
  const after = $<HTMLImageElement>("#road-after");
  after.src = await toObjectUrl(render(before, ROAD_EDIT, 1600));
  await decoded(after);
  roadCompare.reveal();
});

// The portrait in each look the Looks plugin offers.
const looks = $<HTMLUListElement>("#looks");
const lookTiles = LOOKS.map((look) => {
  const tile = document.createElement("li");
  tile.className = "looks__tile";
  const img = document.createElement("img");
  img.alt = `The portrait with the ${look.name} look`;
  const label = document.createElement("span");
  label.textContent = look.name;
  tile.append(img, label);
  looks.append(tile);
  return { look, img };
});
whenNear(looks, async () => {
  const portrait = await decoded($<HTMLImageElement>("#looks img"));
  for (const { look, img } of lookTiles) {
    img.src = await toObjectUrl(render(portrait, lookRecipe(look), 720), 0.86);
    // Yield between tiles so scrolling stays smooth.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
});

// The AI results: before/after for Erase and Upscale, modes for the others.
for (const id of ["#erase-compare", "#upscale-compare"]) {
  const figure = $(id);
  const compare = mountCompare(figure, id === "#erase-compare" ? 0.66 : 0.5);
  whenNear(figure, async () => {
    await Promise.all([...figure.querySelectorAll("img")].map((img) => decoded(img)));
    compare.reveal();
  });
}

// The labs: what Detect and Read text found, saved with the page, and a
// button that runs the same model again on this device.

const runsOn = "gpu" in navigator ? "WebGPU" : "WebAssembly";

function formatMs(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

function formatMb(bytes: number): string {
  return `${(bytes / 1e6).toFixed(1)} MB`;
}

function mountRun(
  root: HTMLElement,
  lab: ReturnType<typeof mountLab>,
  run: (
    image: HTMLImageElement,
    onDownload: (loaded: number, total: number) => void,
  ) => Promise<LabItem[]>,
  done: (items: LabItem[], time: string) => string,
): void {
  const button = root.querySelector<HTMLButtonElement>("[data-run]");
  const label = button?.querySelector("span:last-child");
  if (!button || !label) return;
  button.addEventListener("click", async () => {
    button.disabled = true;
    let downloaded = 0;
    lab.status("Starting…");
    try {
      const image = await decoded(root.querySelector("img") as HTMLImageElement);
      const started = performance.now();
      const items = await run(image, (loaded, total) => {
        // A saved model reports itself once, already complete.
        if (loaded < total) downloaded = total;
        lab.status(
          loaded < total
            ? `Downloading the model: ${formatMb(loaded)} of ${formatMb(total)}…`
            : "Running…",
        );
      });
      const time = formatMs(performance.now() - started);
      lab.show(items, true);
      lab.status(
        done(items, time) +
          (downloaded > 0 ? " That includes the download; it's saved now, so run it again." : ""),
      );
      label.textContent = "Run it again";
    } catch (error) {
      lab.status("It didn't run on this browser. The results above are the saved ones.");
      console.error(error);
    } finally {
      button.disabled = false;
    }
  });
}

const detectRoot = $("#detect-lab");
const detectLab = mountLab(detectRoot, { tags: true });
detectLab.show(detectionItems(LONDON_OBJECTS));
detectLab.status("Saved from an earlier run. Run it to watch it find them on your device.");
mountRun(
  detectRoot,
  detectLab,
  async (image, onDownload) =>
    detectionItems(
      await detectObjects(image, {
        scoreThreshold: 0.4,
        onDownloadProgress: (p) => onDownload(p.loaded, p.total),
      }),
    ),
  (items, time) => `Found ${items.length} things in ${time}, on this device (${runsOn}).`,
);

const textRoot = $("#text-lab");
const textLab = mountLab(textRoot, { tags: false });
let textLines = SIGNPOST_TEXT.map(withBounds);
textLab.show(textItems(textLines));
textLab.status("Saved from an earlier run. Run it to watch it read them on your device.");
mountRun(
  textRoot,
  textLab,
  async (image, onDownload) => {
    textLines = (
      await recognizeText(image, {
        onDownloadProgress: (p) => onDownload(p.loaded, p.total),
      })
    ).map(withBounds);
    return textItems(textLines);
  },
  (items, time) => `Read ${items.length} lines in ${time}, on this device (${runsOn}).`,
);
const copyText = $<HTMLButtonElement>("[data-copy-text]");
copyText.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(linesToText(textLines));
  } catch {
    return;
  }
  copyText.textContent = "Copied";
  setTimeout(() => {
    copyText.textContent = "Copy text";
  }, 1600);
});

function segmented(group: string, target: HTMLElement, attribute: string): void {
  const buttons = [...document.querySelectorAll<HTMLButtonElement>(`[data-${group}]`)].filter(
    (button) => button.tagName === "BUTTON",
  );
  for (const button of buttons) {
    button.addEventListener("click", () => {
      target.setAttribute(attribute, button.getAttribute(`data-${group}`) ?? "");
      for (const other of buttons) other.setAttribute("aria-pressed", String(other === button));
    });
  }
}
segmented("select", $("#select"), "data-mode");
segmented("bg", $("#cutout"), "data-bg");

// ── The rest of the page ────────────────────────────────────────────────

const ICON_PHONE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/></svg>';
const ICONS: Record<string, string> = {
  crop: ICON_TOOL_CROP,
  transform: ICON_TOOL_TRANSFORM,
  masks: ICON_TOOL_MASKS,
  liquify: ICON_TOOL_LIQUIFY,
  stylize: ICON_TOOL_STYLIZE,
  trim: ICON_TOOL_TRIM,
  sparkle: ICON_SPARKLE,
  phone: ICON_PHONE,
  download: ICON_DOWNLOAD,
};
for (const slot of document.querySelectorAll<HTMLElement>("[data-icon]")) {
  slot.innerHTML = ICONS[slot.dataset.icon ?? ""] ?? "";
}

// The version badge follows the library, so there is no version string to keep in sync.
$("[data-version]").textContent = `npm v${VERSION}`;

for (const button of document.querySelectorAll<HTMLButtonElement>("[data-copy]")) {
  const icon = button.innerHTML;
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(button.dataset.copy ?? "");
    } catch {
      return;
    }
    button.classList.add("is-copied");
    button.innerHTML = ICON_CHECK;
    setTimeout(() => {
      button.classList.remove("is-copied");
      button.innerHTML = icon;
    }, 1600);
  });
}

// Photo credits, from the same list the page loads its photos from.
$("#credits").replaceChildren(
  ...Object.values(PHOTOS).flatMap((photo, i, all) => {
    const link = document.createElement("a");
    link.href = photo.authorUrl;
    link.textContent = photo.author;
    const joiner = i === all.length - 1 ? "" : i === all.length - 2 ? " and " : ", ";
    return [link, joiner];
  }),
);

// Sections settle in as they scroll into view, unless motion is reduced.
if (window.matchMedia("(prefers-reduced-motion: no-preference)").matches) {
  document.documentElement.classList.add("has-motion");
  const revealer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-in");
        revealer.unobserve(entry.target);
      }
    },
    { rootMargin: "0px 0px -8% 0px" },
  );
  for (const element of document.querySelectorAll("[data-reveal]")) revealer.observe(element);
}

Object.assign(window, { editor });

// The header menus are <details>, as on 9tensor.com: one open at a time, shut on a click elsewhere or Escape.
const menus = [...document.querySelectorAll<HTMLDetailsElement>(".menu")];
for (const menu of menus) {
  menu.addEventListener("toggle", () => {
    if (menu.open) for (const other of menus) if (other !== menu) other.open = false;
  });
}
document.addEventListener("click", (event) => {
  for (const menu of menus) if (!menu.contains(event.target as Node)) menu.open = false;
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  for (const menu of menus) {
    if (!menu.open) continue;
    menu.open = false;
    menu.querySelector("summary")?.focus();
  }
});
