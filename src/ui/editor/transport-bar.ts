import type { VideoEdits, ViewHandle } from "../../types";
import { clamp } from "../../utils/math";
import type { SeekQueue } from "../../utils/video";
import { formatTime } from "../../utils/video";
import { h } from "../h";

export interface TransportBarOptions {
  video: HTMLVideoElement;
  /** Live edits object — trim range is read on every loop check. */
  edits: VideoEdits;
  seekQueue: SeekQueue;
  onMuteChange: (mute: boolean) => void;
}

export interface TransportBarHandle extends ViewHandle {
  /** Container the trim tool mounts its filmstrip + handles into. */
  getStripEl(): HTMLElement;
  /** Hide/show the plain scrubber (the trim tool replaces it with a filmstrip). */
  setScrubberVisible(visible: boolean): void;
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

export function createTransportBar(options: TransportBarOptions): TransportBarHandle {
  const { video, edits, seekQueue } = options;
  const abort = new AbortController();
  const signal = abort.signal;
  let rafId = 0;

  // ── Controls ──

  const playBtn = h("button", { class: "rt-video-bar__btn", title: "Play/Pause (Space)" });
  playBtn.innerHTML = PLAY_ICON;

  const muteBtn = h("button", { class: "rt-video-bar__btn", title: "Mute" });
  video.muted = edits.mute;
  muteBtn.innerHTML = edits.mute ? MUTED_ICON : SOUND_ICON;

  const timeEl = h("span", { class: "rt-video-bar__time" });

  const scrubber = h("input", {
    type: "range",
    class: "rt-video-bar__scrubber",
    min: 0,
    max: video.duration,
    step: 0.01,
    value: video.currentTime,
  }) as HTMLInputElement;

  const strip = h("div", { class: "rt-video-bar__strip" }, scrubber);

  const root = h("div", { class: "rt-video-bar" }, playBtn, strip, timeEl, muteBtn);

  // ── Time / playhead sync ──

  function updateReadout(): void {
    const trimmed = Math.max(0, edits.trim.end - edits.trim.start);
    const current = clamp(video.currentTime - edits.trim.start, 0, trimmed);
    timeEl.textContent = `${formatTime(current)} / ${formatTime(trimmed)}`;
    scrubber.value = String(video.currentTime);
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

  // ── Interactions ──

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

  scrubber.addEventListener(
    "input",
    () => {
      void seekQueue.seek(Number(scrubber.value));
    },
    { signal },
  );

  updateReadout();

  return {
    root,
    getStripEl: () => strip,
    setScrubberVisible(visible) {
      scrubber.style.display = visible ? "" : "none";
    },
    destroy() {
      cancelAnimationFrame(rafId);
      abort.abort();
      root.remove();
    },
  };
}
