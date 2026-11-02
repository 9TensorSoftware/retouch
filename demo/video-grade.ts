import { createPreviewBase, renderLookToCanvas } from "../src/ui/editor/preview";
import type { Recipe } from "./photos";
import { recipeEdits } from "./render";

// A video graded live: each frame the browser presents goes through the
// editor's own preview pipeline into a canvas laid over the video, so the
// compare divider shows the clip before and after, in motion.

/** The longest edge frames are graded at; the canvas scales up to fit. */
const SIZE = 720;

export function mountVideoGrade(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  recipe: Recipe,
  onFirstFrame?: () => void,
): void {
  const edits = recipeEdits(recipe);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  let busy = false;

  function grade(): void {
    if (busy || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    busy = true;
    const out = renderLookToCanvas(createPreviewBase(video, SIZE), edits);
    if (canvas.width !== out.width || canvas.height !== out.height) {
      canvas.width = out.width;
      canvas.height = out.height;
    }
    ctx?.drawImage(out, 0, 0);
    busy = false;
    onFirstFrame?.();
    onFirstFrame = undefined;
  }

  // requestVideoFrameCallback runs once per presented frame; browsers
  // without it fall back to every animation frame while playing.
  if (typeof video.requestVideoFrameCallback === "function") {
    const onFrame = () => {
      grade();
      video.requestVideoFrameCallback(onFrame);
    };
    video.requestVideoFrameCallback(onFrame);
  } else {
    let raf = 0;
    const loop = () => {
      grade();
      raf = video.paused ? 0 : requestAnimationFrame(loop);
    };
    video.addEventListener("play", () => {
      if (!raf) raf = requestAnimationFrame(loop);
    });
  }
  video.addEventListener("loadeddata", grade);
  video.addEventListener("seeked", grade);

  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  new IntersectionObserver(
    ([entry]) => {
      if (entry.isIntersecting && !still) void video.play().catch(() => {});
      else if (!entry.isIntersecting) video.pause();
    },
    { threshold: 0.35 },
  ).observe(video);
}
