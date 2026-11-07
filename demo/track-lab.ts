import { firstShown, type TrackBox, type TrackedVideo } from "../packages/ml/src/index";

// The Track lab: a clip playing with the tracker's boxes over it, each one
// numbered and trailing where it's been, and a timeline of every track
// beside it. Between the frames the tracker read, boxes glide from one to
// the next, so the overlay keeps up with the video.

/** The prism's colors, then the accent: one per track, in turn. */
const PALETTE = ["#5cc8ff", "#ffc457", "#8ce99a", "#a58bff", "#ff9068", "#ff7eb6"];
const SVG = "http://www.w3.org/2000/svg";
/** Seconds of trail behind each box. */
const TRAIL = 1.6;

export interface TrackLab {
  show(result: TrackedVideo): void;
  status(text: string): void;
  video: HTMLVideoElement;
}

const colorOf = (id: number) => PALETTE[(id - 1) % PALETTE.length];
const nameOf = (box: { id: number; label?: string }) => `${box.label ?? "thing"} ${box.id}`;

function lerp(a: TrackBox, b: TrackBox, f: number): TrackBox {
  return {
    ...a,
    x: a.x + (b.x - a.x) * f,
    y: a.y + (b.y - a.y) * f,
    w: a.w + (b.w - a.w) * f,
    h: a.h + (b.h - a.h) * f,
  };
}

export function mountTrackLab(root: HTMLElement): TrackLab {
  const find = <T extends Element>(selector: string): T => {
    const element = root.querySelector<T>(selector);
    if (!element) throw new Error(`Track lab markup is missing ${selector}`);
    return element;
  };
  const video = find<HTMLVideoElement>("video");
  const marks = find<SVGSVGElement>(".lab__marks");
  const tags = find<HTMLElement>(".lab__tags");
  const list = find<HTMLOListElement>(".lab__list");
  const status = find<HTMLElement>(".lab__status");
  const toggle = find<HTMLButtonElement>("[data-play]");
  let data: TrackedVideo | null = null;
  let pinned: number | null = null;
  let hovered: number | null = null;
  const shapes = new Map<
    number,
    { box: SVGRectElement; trail: SVGPolylineElement; tag: HTMLElement }
  >();
  const rows = new Map<number, HTMLLIElement>();

  function focus(): void {
    const id = hovered ?? pinned;
    root.toggleAttribute("data-focus", id !== null);
    for (const [key, shape] of shapes) {
      const on = key === id;
      shape.box.classList.toggle("is-focus", on);
      shape.tag.classList.toggle("is-focus", on);
      shape.trail.classList.toggle("is-focus", on);
    }
    for (const [key, row] of rows) row.classList.toggle("is-focus", key === id);
  }

  function shapeFor(box: TrackBox) {
    let shape = shapes.get(box.id);
    if (!shape) {
      const color = colorOf(box.id);
      const trail = document.createElementNS(SVG, "polyline");
      trail.setAttribute("vector-effect", "non-scaling-stroke");
      trail.style.setProperty("--c", color);
      const rect = document.createElementNS(SVG, "rect");
      rect.setAttribute("vector-effect", "non-scaling-stroke");
      rect.style.setProperty("--c", color);
      rect.addEventListener("pointerenter", () => hover(box.id));
      rect.addEventListener("pointerleave", () => hover(null));
      rect.addEventListener("click", () => pin(box.id));
      const tag = document.createElement("span");
      tag.className = "lab__tag";
      // The track's one name, not what the vote said by this frame.
      tag.textContent = nameOf(data?.tracks.find((track) => track.id === box.id) ?? box);
      tag.style.setProperty("--c", color);
      marks.append(trail, rect);
      tags.append(tag);
      shape = { box: rect, trail, tag };
      shapes.set(box.id, shape);
    }
    return shape;
  }

  function hover(id: number | null): void {
    hovered = id;
    focus();
  }

  function pin(id: number): void {
    pinned = pinned === id ? null : id;
    focus();
  }

  /** The boxes at `time`, each glided between the two frames around it. */
  function boxesAt(time: number): { boxes: TrackBox[]; index: number } {
    if (!data || data.frames.length === 0) return { boxes: [], index: 0 };
    const { frames, fps } = data;
    const first = frames[0].time;
    const index = Math.max(0, Math.min(frames.length - 1, Math.floor((time - first) * fps)));
    const a = frames[index];
    const b = frames[index + 1];
    if (!b || time <= a.time) return { boxes: a.boxes, index };
    const f = Math.min(1, (time - a.time) / (b.time - a.time));
    const next = new Map(b.boxes.map((box) => [box.id, box]));
    const boxes: TrackBox[] = [];
    for (const box of a.boxes) {
      const to = next.get(box.id);
      if (to) boxes.push(lerp(box, to, f));
      else if (f < 0.5) boxes.push(box);
    }
    const here = new Set(a.boxes.map((box) => box.id));
    for (const box of b.boxes) if (!here.has(box.id) && f >= 0.5) boxes.push(box);
    return { boxes, index };
  }

  // The tracker takes a few frames to trust a track, so every clip opens with
  // no boxes. A stopped video rests on its first frame that has some.
  function skipEmptyOpening(): void {
    const opening = data?.frames.find((frame) => frame.boxes.length > 0);
    if (video.paused && opening && video.currentTime < opening.time) {
      video.currentTime = opening.time;
    }
  }

  function draw(time = video.currentTime): void {
    if (!data) return;
    const { boxes, index } = boxesAt(time);
    const on = new Set(boxes.map((box) => box.id));
    for (const box of boxes) {
      const shape = shapeFor(box);
      shape.box.setAttribute("x", String(box.x));
      shape.box.setAttribute("y", String(box.y));
      shape.box.setAttribute("width", String(box.w));
      shape.box.setAttribute("height", String(box.h));
      shape.tag.style.left = `${box.x * 100}%`;
      shape.tag.style.top = `${box.y * 100}%`;
      // Where its center has been over the last moments, ending where it is now.
      const points: string[] = [];
      for (let i = Math.max(0, index - Math.round(TRAIL * data.fps)); i <= index; i++) {
        const past = data.frames[i].boxes.find((b) => b.id === box.id);
        if (past) points.push(`${past.x + past.w / 2},${past.y + past.h / 2}`);
      }
      points.push(`${box.x + box.w / 2},${box.y + box.h / 2}`);
      shape.trail.setAttribute("points", points.join(" "));
    }
    for (const [id, shape] of shapes) {
      const hidden = !on.has(id);
      shape.box.classList.toggle("is-gone", hidden);
      shape.trail.classList.toggle("is-gone", hidden);
      shape.tag.classList.toggle("is-gone", hidden);
    }
    for (const [id, row] of rows) row.classList.toggle("is-on", on.has(id));
    list.style.setProperty("--t", String(video.duration ? time / video.duration : 0));
  }

  // Drawn per presented frame, at that frame's own time: currentTime runs
  // ahead of the picture. Browsers without the callback draw per animation frame.
  if (typeof video.requestVideoFrameCallback === "function") {
    const onFrame = (_now: number, meta: VideoFrameCallbackMetadata) => {
      draw(meta.mediaTime);
      video.requestVideoFrameCallback(onFrame);
    };
    video.requestVideoFrameCallback(onFrame);
  } else {
    let frame = 0;
    const loop = () => {
      draw();
      frame = video.paused ? 0 : requestAnimationFrame(loop);
    };
    video.addEventListener("play", () => {
      if (!frame) frame = requestAnimationFrame(loop);
    });
  }
  video.addEventListener("seeked", () => draw());
  video.addEventListener("pause", () => {
    skipEmptyOpening();
    draw();
  });
  video.addEventListener("loadedmetadata", () => draw());
  // Changing the source stops the video without a pause event; it only fires emptied.
  const showPlayState = () => toggle.setAttribute("aria-label", video.paused ? "Play" : "Pause");
  for (const event of ["play", "pause", "emptied"]) video.addEventListener(event, showPlayState);
  toggle.addEventListener("click", () => {
    if (video.paused) void video.play().catch(() => {});
    else video.pause();
  });

  // Plays while it's on screen, unless motion is turned down: then it waits for Play.
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  new IntersectionObserver(
    ([entry]) => {
      if (entry.isIntersecting && !still) void video.play().catch(() => {});
      else if (!entry.isIntersecting) video.pause();
    },
    { threshold: 0.35 },
  ).observe(video);

  function rowFor(
    track: TrackedVideo["tracks"][number],
    duration: number,
    i: number,
  ): HTMLLIElement {
    const row = document.createElement("li");
    row.tabIndex = 0;
    row.style.setProperty("--c", colorOf(track.id));
    row.style.setProperty("--d", `${i * 70}ms`);
    const name = document.createElement("span");
    name.className = "lab__label";
    name.textContent = nameOf(track);
    const span = document.createElement("span");
    span.className = "track-lab__span";
    span.style.setProperty("--a", String(track.firstSeen / duration));
    span.style.setProperty(
      "--b",
      String(Math.max(track.lastSeen, track.firstSeen + 0.1) / duration),
    );
    const time = document.createElement("span");
    time.className = "lab__score";
    time.textContent = `${(track.lastSeen - track.firstSeen).toFixed(1)} s`;
    row.append(name, span, time);
    row.addEventListener("pointerenter", () => hover(track.id));
    row.addEventListener("pointerleave", () => hover(null));
    row.addEventListener("focus", () => hover(track.id));
    row.addEventListener("blur", () => hover(null));
    // Clicking a track jumps to where it's first on screen.
    row.addEventListener("click", () => {
      pin(track.id);
      if (data) video.currentTime = firstShown(data, track.id) ?? track.firstSeen;
    });
    return row;
  }

  return {
    video,
    show(result) {
      data = result;
      pinned = null;
      hovered = null;
      marks.replaceChildren();
      tags.replaceChildren();
      list.replaceChildren();
      shapes.clear();
      rows.clear();
      const duration = video.duration || result.frames.at(-1)?.time || 1;
      // Longest-lived first: the ones it followed all the way.
      const tracks = [...result.tracks].sort(
        (a, b) => b.lastSeen - b.firstSeen - (a.lastSeen - a.firstSeen) || a.id - b.id,
      );
      tracks.forEach((track, i) => {
        const row = rowFor(track, duration, i);
        rows.set(track.id, row);
        list.append(row);
      });
      focus();
      skipEmptyOpening();
      draw();
    },
    status(text) {
      status.textContent = text;
    },
  };
}
