import {
  detectObjects,
  installMlTools,
  linesToText,
  recognizeText,
  type TrackedVideo,
  trackVideo,
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
  CLIPS,
  type ClipName,
  describe,
  FOGGY_EDIT,
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
import { mountTrackLab } from "./track-lab";
import { mountVideoGrade } from "./video-grade";

const BASE = import.meta.env.BASE_URL;
const photoUrl = (name: PhotoName) => `${BASE}photos/${PHOTOS[name].file}`;
const clipUrl = (name: ClipName, ext = "mp4") =>
  `${BASE}videos/${CLIPS[name].file.replace(/\.mp4$/, `.${ext}`)}`;

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

/** A fetched photo as a File, dated by the server (Info shows when it was modified). */
async function photoFile(name: PhotoName, response: Response): Promise<File> {
  const blob = await response.blob();
  const stamp = Date.parse(response.headers.get("last-modified") ?? "");
  return new File([blob], PHOTOS[name].file, {
    type: blob.type || "image/jpeg",
    lastModified: Number.isNaN(stamp) ? undefined : stamp,
  });
}

/** A fetched clip as a File, dated by the server like the photos. */
async function clipFile(name: ClipName): Promise<File> {
  const response = await fetch(clipUrl(name));
  if (!response.ok) throw new Error(`Couldn't load ${CLIPS[name].file}`);
  const blob = await response.blob();
  const stamp = Date.parse(response.headers.get("last-modified") ?? "");
  return new File([blob], CLIPS[name].file, {
    type: "video/mp4",
    lastModified: Number.isNaN(stamp) ? undefined : stamp,
  });
}

/** The clip the gallery opens with, after the photos. */
const GALLERY_CLIP: ClipName = "foggyHill";

/** Fetch the sample photos into the gallery; resolves to each one's entry id. */
async function loadSamples(): Promise<Map<PhotoName, string>> {
  const files = await Promise.all([
    ...GALLERY.map(async (name) => {
      const response = await fetch(photoUrl(name));
      if (!response.ok) throw new Error(`Couldn't load ${PHOTOS[name].file}`);
      return photoFile(name, response);
    }),
    clipFile(GALLERY_CLIP),
  ]);
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
  const file = await photoFile(name, response);
  const before = new Set(editor.getMedia().map((entry) => entry.id));
  await editor.addFiles([file]);
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

/** Open a clip in the editor on Adjust, graded as the page shows it until it's been edited. */
async function editClip(name: ClipName, tool = "adjust"): Promise<void> {
  await samples.catch(() => undefined);
  const file = CLIPS[name].file;
  let entry = editor.getMedia().find((e) => e.kind === "video" && e.file.name === file);
  if (!entry) {
    const before = new Set(editor.getMedia().map((e) => e.id));
    await editor.addFiles([await clipFile(name)]);
    entry = editor.getMedia().find((e) => !before.has(e.id));
  }
  if (!entry) return;
  if (name === "foggyHill" && !entry.edited) Object.assign(entry.edits, recipeEdits(FOGGY_EDIT));
  editor.openEditor(entry.id, { tool });
}

for (const button of document.querySelectorAll<HTMLButtonElement>("[data-edit-clip]")) {
  button.addEventListener("click", () => void editClip(button.dataset.editClip as ClipName));
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

// The foggy hill, graded live while it plays, by the same renderer.
const foggyFigure = $("#foggy-compare");
const foggyCompare = mountCompare(foggyFigure);
chips($("#foggy-recipe"), describe(FOGGY_EDIT));
whenNear(foggyFigure, async () => {
  mountVideoGrade(
    $<HTMLVideoElement>("#foggy-before"),
    $<HTMLCanvasElement>("#foggy-after"),
    FOGGY_EDIT,
    () => foggyCompare.reveal(),
  );
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

// Track: what the tracker followed through each clip, saved with the page,
// and the same run again on this device.
const trackRoot = $("#track-lab");
const trackLab = mountTrackLab(trackRoot);
let trackClip: ClipName = "hydePark";
const trackRuns = new Map<ClipName, TrackedVideo>();

async function savedTracks(name: ClipName): Promise<TrackedVideo | null> {
  const response = await fetch(clipUrl(name, "tracks.json")).catch(() => null);
  return response?.ok ? response.json().catch(() => null) : null;
}

function trackSummary(result: TrackedVideo): string {
  return `Followed ${result.tracks.length} things through ${result.frames.length} frames`;
}

async function showClip(name: ClipName): Promise<void> {
  trackClip = name;
  const { video } = trackLab;
  const clip = CLIPS[name];
  if (!video.src.endsWith(clipUrl(name))) {
    video.poster = clipUrl(name, "jpg");
    video.src = clipUrl(name);
    video.setAttribute("aria-label", clip.alt);
  }
  const run = trackRuns.get(name);
  const result = run ?? (await savedTracks(name));
  if (trackClip !== name) return;
  if (!result) {
    trackLab.status("Run it to watch it follow them on your device.");
    return;
  }
  trackLab.show(result);
  trackLab.status(
    run
      ? `${trackSummary(result)}, on this device (${runsOn}).`
      : "Saved from an earlier run. Run it to watch it follow them on your device.",
  );
}

for (const button of trackRoot.querySelectorAll<HTMLButtonElement>("[data-clip]")) {
  button.addEventListener("click", () => {
    for (const other of trackRoot.querySelectorAll("[data-clip]")) {
      other.setAttribute("aria-pressed", String(other === button));
    }
    void showClip(button.dataset.clip as ClipName);
  });
}
whenNear(trackRoot, () => showClip(trackClip));
// The same clip in the editor's own Track tool, where any video can go.
$("[data-track-editor]").addEventListener("click", () => void editClip(trackClip, "track"));

const TRACKED = ["person", "bicycle", "motorcycle", "car", "bus", "truck", "dog"];
const trackButton = $<HTMLButtonElement>('[data-run="track"]');
trackButton.addEventListener("click", async () => {
  const name = trackClip;
  const label = trackButton.querySelector("span:last-child");
  trackButton.disabled = true;
  trackLab.status("Starting…");
  // A video of its own to seek through, so the one on the page keeps playing.
  const video = document.createElement("video");
  video.muted = true;
  video.preload = "auto";
  video.src = clipUrl(name);
  let downloaded = 0;
  const started = performance.now();
  try {
    const result = await trackVideo(video, {
      fps: 6,
      scoreThreshold: 0.4,
      // People, bikes and traffic; the people in the distance come and go,
      // so it follows the ones in the scene.
      labels: TRACKED,
      minSize: 0.1,
      onDownloadProgress: (p) => {
        if (p.loaded < p.total) downloaded = p.total;
        if (p.loaded < p.total) {
          trackLab.status(`Downloading the model: ${formatMb(p.loaded)} of ${formatMb(p.total)}…`);
        }
      },
      onFrame: (_frame, progress) => {
        if (trackClip === name) trackLab.status(`Following… ${Math.round(progress * 100)}%`);
      },
    });
    trackRuns.set(name, result);
    if (trackClip !== name) return;
    trackLab.show(result);
    trackLab.status(
      `${trackSummary(result)} in ${formatMs(performance.now() - started)}, on this device (${runsOn}).` +
        (downloaded > 0 ? " That includes the download; it's saved now, so run it again." : ""),
    );
    if (label) label.textContent = "Run it again";
  } catch (error) {
    trackLab.status("It didn't run on this browser. The tracks above are the saved ones.");
    console.error(error);
  } finally {
    trackButton.disabled = false;
    video.removeAttribute("src");
    video.load();
  }
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

$("#clip-credits").replaceChildren(
  ...[...new Set(Object.values(CLIPS).map((clip) => clip.author))].flatMap((author, i, all) => {
    const clip = Object.values(CLIPS).find((c) => c.author === author) as (typeof CLIPS)[ClipName];
    const link = document.createElement("a");
    link.href = clip.url;
    link.textContent = author;
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
