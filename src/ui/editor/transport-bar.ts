import { FILMSTRIP_MAX_THUMBS, FILMSTRIP_THUMB_HEIGHT } from "../../constants";
import type { TrimRange, VideoEdits, ViewHandle } from "../../types";
import { clamp } from "../../utils/math";
import type { SeekQueue } from "../../utils/video";
import { clampTrim, formatTime, generateFilmstrip, snapTime } from "../../utils/video";
import { h } from "../h";

export interface TransportBarOptions {
  video: HTMLVideoElement;
  /** Live edits object — trim is read on every loop check and mutated by handle drags. */
  edits: VideoEdits;
  seekQueue: SeekQueue;
  videoUrl: string;
  duration: number;
  videoWidth: number;
  videoHeight: number;
  onMuteChange: (mute: boolean) => void;
}

export interface TransportBarHandle extends ViewHandle {
  /** Show/hide the trim in/out handles (the Trim tool toggles this). */
  setTrimEditable(editable: boolean): void;
  /** Reposition trim visuals after an external change (e.g. reset). */
  setTrim(range: TrimRange): void;
  /** Sync the mute button + element after an external change. */
  setMuted(mute: boolean): void;
  /** Subscribe to handle-drag trim changes. Returns unsubscribe. */
  onTrimChange(fn: (range: TrimRange) => void): () => void;
}

const PLAY_ICON =
  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>';
const PAUSE_ICON =
  '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
const SOUND_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" stroke="none"/><path d="M16 9a4 4 0 010 6"/></svg>';
const MUTED_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" stroke="none"/><path d="M16 9l5 6M21 9l-5 6"/></svg>';

/** How close to the trim end counts as "reached it", in seconds. */
const LOOP_EPSILON = 0.03;

/** Keyboard nudge sizes for trim handles, in seconds. */
const NUDGE = 0.1;
const NUDGE_LARGE = 1;

export function createTransportBar(options: TransportBarOptions): TransportBarHandle {
  const { video, edits, seekQueue, duration } = options;
  const abort = new AbortController();
  const signal = abort.signal;
  let rafId = 0;
  const trimListeners = new Set<(range: TrimRange) => void>();

  // ── Controls ──

  const playBtn = h("button", { class: "rt-video-bar__btn", title: "Play/Pause (Space)" });
  playBtn.innerHTML = PLAY_ICON;

  const muteBtn = h("button", { class: "rt-video-bar__btn", title: "Mute" });
  video.muted = edits.mute;
  muteBtn.innerHTML = edits.mute ? MUTED_ICON : SOUND_ICON;

  const timeEl = h("span", { class: "rt-video-bar__time" });

  // ── Filmstrip scrubber ──

  const strip = h("div", { class: "rt-filmstrip" });
  const thumbsRow = h("div", { class: "rt-filmstrip__thumbs" });
  const shadeLeft = h("div", { class: "rt-filmstrip__shade rt-filmstrip__shade--left" });
  const shadeRight = h("div", { class: "rt-filmstrip__shade rt-filmstrip__shade--right" });
  const playhead = h("div", { class: "rt-filmstrip__playhead" });
  const handleIn = h("div", {
    class: "rt-filmstrip__handle rt-filmstrip__handle--in",
    role: "slider",
    tabindex: 0,
    "aria-label": "Trim start",
    "aria-valuemin": 0,
    "aria-valuemax": duration,
  });
  const handleOut = h("div", {
    class: "rt-filmstrip__handle rt-filmstrip__handle--out",
    role: "slider",
    tabindex: 0,
    "aria-label": "Trim end",
    "aria-valuemin": 0,
    "aria-valuemax": duration,
  });
  strip.append(thumbsRow, shadeLeft, shadeRight, playhead, handleIn, handleOut);

  const aspect = options.videoWidth / Math.max(1, options.videoHeight);
  const thumbWidth = Math.round(clamp(FILMSTRIP_THUMB_HEIGHT * aspect, 32, 85));
  const thumbCount = Math.min(FILMSTRIP_MAX_THUMBS, Math.max(6, Math.ceil(duration)));
  for (let i = 0; i < thumbCount; i++) {
    thumbsRow.appendChild(h("div", { class: "rt-filmstrip__thumb-slot" }));
  }
  const cancelFilmstrip = generateFilmstrip(
    {
      url: options.videoUrl,
      duration,
      count: thumbCount,
      thumbWidth,
      thumbHeight: FILMSTRIP_THUMB_HEIGHT,
    },
    (index, canvas) => {
      const slot = thumbsRow.children[index];
      if (slot) slot.appendChild(canvas);
    },
  );

  const root = h("div", { class: "rt-video-bar" }, playBtn, strip, timeEl, muteBtn);

  // ── Visual sync ──

  const pct = (t: number) => `${(clamp(t, 0, duration) / Math.max(duration, 1e-6)) * 100}%`;

  function updateTrimVisuals(): void {
    shadeLeft.style.left = "0";
    shadeLeft.style.width = pct(edits.trim.start);
    shadeRight.style.left = pct(edits.trim.end);
    shadeRight.style.right = "0";
    handleIn.style.left = pct(edits.trim.start);
    handleOut.style.left = pct(edits.trim.end);
    handleIn.setAttribute("aria-valuenow", edits.trim.start.toFixed(2));
    handleIn.setAttribute("aria-valuetext", formatTime(edits.trim.start));
    handleOut.setAttribute("aria-valuenow", edits.trim.end.toFixed(2));
    handleOut.setAttribute("aria-valuetext", formatTime(edits.trim.end));
  }

  function updateReadout(): void {
    const trimmed = Math.max(0, edits.trim.end - edits.trim.start);
    const current = clamp(video.currentTime - edits.trim.start, 0, trimmed);
    timeEl.textContent = `${formatTime(current)} / ${formatTime(trimmed)}`;
    playhead.style.left = pct(video.currentTime);
  }

  function notifyTrim(): void {
    updateTrimVisuals();
    updateReadout();
    for (const fn of trimListeners) fn({ ...edits.trim });
  }

  function loopCheck(): void {
    if (video.currentTime >= edits.trim.end - LOOP_EPSILON) {
      video.currentTime = edits.trim.start;
    }
  }

  function tick(): void {
    loopCheck();
    updateReadout();
    rafId = requestAnimationFrame(tick);
  }

  video.addEventListener(
    "play",
    () => {
      playBtn.innerHTML = PAUSE_ICON;
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(tick);
    },
    { signal },
  );

  const onStop = () => {
    playBtn.innerHTML = PLAY_ICON;
    cancelAnimationFrame(rafId);
    updateReadout();
  };
  video.addEventListener("pause", onStop, { signal });
  video.addEventListener("ended", onStop, { signal });
  video.addEventListener("seeked", updateReadout, { signal });

  // ── Playback interactions ──

  function play(): void {
    // Re-enter the trim range before playing.
    if (
      video.currentTime < edits.trim.start ||
      video.currentTime >= edits.trim.end - LOOP_EPSILON
    ) {
      video.currentTime = edits.trim.start;
    }
    video.play().catch(() => {
      // Autoplay policy: retry muted so playback still starts.
      video.muted = true;
      muteBtn.innerHTML = MUTED_ICON;
      video.play().catch(() => {});
    });
  }

  playBtn.addEventListener(
    "click",
    () => {
      if (video.paused) play();
      else video.pause();
    },
    { signal },
  );

  muteBtn.addEventListener(
    "click",
    () => {
      const mute = !video.muted;
      video.muted = mute;
      muteBtn.innerHTML = mute ? MUTED_ICON : SOUND_ICON;
      options.onMuteChange(mute);
    },
    { signal },
  );

  // ── Scrubbing (strip click/drag outside the handles) ──

  function stripTimeFromPointer(clientX: number): number | null {
    const rect = strip.getBoundingClientRect();
    if (rect.width <= 0) return null;
    return clamp(((clientX - rect.left) / rect.width) * duration, 0, duration);
  }

  let scrubbing = false;
  strip.addEventListener(
    "pointerdown",
    (e) => {
      if ((e.target as HTMLElement).classList.contains("rt-filmstrip__handle")) return;
      e.preventDefault();
      scrubbing = true;
      const t = stripTimeFromPointer(e.clientX);
      if (t !== null) void seekQueue.seek(t);
    },
    { signal },
  );

  // ── Trim handle dragging ──

  type DragSide = "in" | "out" | null;
  let dragging: DragSide = null;

  function applyTrim(next: TrimRange, seekTo: number): void {
    const clamped = clampTrim(next, duration);
    edits.trim.start = clamped.start;
    edits.trim.end = clamped.end;
    void seekQueue.seek(
      seekTo === clamped.start || seekTo === clamped.end ? seekTo : clamped.start,
    );
    notifyTrim();
  }

  function dragTo(side: Exclude<DragSide, null>, clientX: number): void {
    const raw = stripTimeFromPointer(clientX);
    if (raw === null) return;
    const snapped = snapTime(raw, [0, duration, video.currentTime]);
    if (side === "in") {
      applyTrim({ start: snapped, end: edits.trim.end }, snapped);
    } else {
      applyTrim({ start: edits.trim.start, end: snapped }, snapped);
    }
  }

  for (const [el, side] of [
    [handleIn, "in"],
    [handleOut, "out"],
  ] as const) {
    el.addEventListener(
      "pointerdown",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        video.pause();
        dragging = side;
      },
      { signal },
    );

    el.addEventListener(
      "keydown",
      (e) => {
        const key = (e as KeyboardEvent).key;
        if (key !== "ArrowLeft" && key !== "ArrowRight") return;
        e.preventDefault();
        const delta =
          ((e as KeyboardEvent).shiftKey ? NUDGE_LARGE : NUDGE) * (key === "ArrowLeft" ? -1 : 1);
        if (side === "in") {
          const start = edits.trim.start + delta;
          applyTrim({ start, end: edits.trim.end }, start);
        } else {
          const end = edits.trim.end + delta;
          applyTrim({ start: edits.trim.start, end }, end);
        }
      },
      { signal },
    );
  }

  document.addEventListener(
    "pointermove",
    (e) => {
      if (dragging) {
        e.preventDefault();
        dragTo(dragging, e.clientX);
      } else if (scrubbing) {
        e.preventDefault();
        const t = stripTimeFromPointer(e.clientX);
        if (t !== null) void seekQueue.seek(t);
      }
    },
    { signal },
  );

  document.addEventListener(
    "pointerup",
    () => {
      dragging = null;
      scrubbing = false;
    },
    { signal },
  );

  updateTrimVisuals();
  updateReadout();

  return {
    root,
    setTrimEditable(editable) {
      strip.classList.toggle("rt-filmstrip--editable", editable);
    },
    setTrim(range) {
      const clamped = clampTrim(range, duration);
      edits.trim.start = clamped.start;
      edits.trim.end = clamped.end;
      notifyTrim();
    },
    setMuted(mute) {
      video.muted = mute;
      muteBtn.innerHTML = mute ? MUTED_ICON : SOUND_ICON;
    },
    onTrimChange(fn) {
      trimListeners.add(fn);
      return () => trimListeners.delete(fn);
    },
    destroy() {
      cancelAnimationFrame(rafId);
      cancelFilmstrip();
      abort.abort();
      trimListeners.clear();
      root.remove();
    },
  };
}
