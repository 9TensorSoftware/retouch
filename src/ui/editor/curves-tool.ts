import type { CurvePoint, Curves } from "../../types";
import { buildCurveLut, curveIsIdentity } from "../../utils/curves";
import { clamp } from "../../utils/math";
import { h } from "../h";
import { createSegmented } from "./controls";

export interface CurvesToolOptions {
  curves: Curves;
  /** Fires with a cloned curves object on every change. */
  onChange: (curves: Curves) => void;
  /** Input-luminance histogram drawn behind the curve. */
  getHistogram: () => Uint32Array;
}

export interface CurvesToolHandle {
  root: HTMLElement;
  /** Sync after an external change (undo/reset/AI) — does not fire onChange. */
  setCurves(curves: Curves): void;
  /** Recompute the histogram background (when the pane becomes active). */
  refreshHistogram(): void;
  destroy(): void;
}

type Channel = "master" | "r" | "g" | "b";

const CHANNELS: { id: Channel; label: string; title: string; color: string }[] = [
  { id: "master", label: "RGB", title: "All channels", color: "#EDEDED" },
  { id: "r", label: "R", title: "Red channel", color: "#FF6B6B" },
  { id: "g", label: "G", title: "Green channel", color: "#5FDC8A" },
  { id: "b", label: "B", title: "Blue channel", color: "#5C9DFF" },
];

/** Grab distance around a point, in CSS px; a fingertip gets more. */
const HIT_RADIUS = 12;
const TOUCH_HIT_RADIUS = 22;
const MAX_POINTS = 16;
const MIN_GAP = 0.02;
const HINT = "Click the curve to add a point · double-click a point to remove it";

/**
 * Tone-curve editor across the inspector's full width: drag points, click
 * to add one, double-click to remove. One curve per channel, the input
 * histogram behind it, and a readout of the point under the pointer.
 */
export function createCurvesTool(options: CurvesToolOptions): CurvesToolHandle {
  const abort = new AbortController();
  const signal = abort.signal;
  let curves: Curves = structuredClone(options.curves);
  let channel: Channel = "master";
  let histogram: Uint32Array = new Uint32Array(256);
  let dragging: number | null = null;
  let hover: number | null = null;

  const canvas = h("canvas", {
    class: "rt-curves__canvas",
    role: "img",
    "aria-label": "Tone curve. Drag points to shape it.",
  }) as HTMLCanvasElement;
  const ctx = canvas.getContext("2d");
  const readout = h("p", { class: "rt-curves__readout", "aria-live": "polite" }, HINT);

  /** Backing-store size follows the laid-out size. */
  function sizeToLayout(): boolean {
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    const w = Math.round(canvas.clientWidth * dpr);
    const hgt = Math.round(canvas.clientHeight * dpr);
    if (w === 0 || hgt === 0) return false;
    if (canvas.width !== w || canvas.height !== hgt) {
      canvas.width = w;
      canvas.height = hgt;
    }
    return true;
  }

  // ── Drawing ──

  function draw(): void {
    if (!ctx || !sizeToLayout()) return;
    const w = canvas.width;
    const hgt = canvas.height;
    const dpr = w / Math.max(1, canvas.clientWidth);
    ctx.clearRect(0, 0, w, hgt);

    // Quarter grid. Canvas can't read CSS custom properties, so these
    // literals mirror the darkroom tokens in styles.ts.
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.lineWidth = dpr;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(Math.round((w * i) / 4) + 0.5, 0);
      ctx.lineTo(Math.round((w * i) / 4) + 0.5, hgt);
      ctx.moveTo(0, Math.round((hgt * i) / 4) + 0.5);
      ctx.lineTo(w, Math.round((hgt * i) / 4) + 0.5);
      ctx.stroke();
    }

    // Histogram (sqrt scale reads better than linear), as one filled shape
    const peak = Math.sqrt(Math.max(1, ...histogram));
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.beginPath();
    ctx.moveTo(0, hgt);
    for (let i = 0; i < 256; i++) {
      ctx.lineTo((i / 255) * w, hgt - (Math.sqrt(histogram[i]) / peak) * hgt * 0.9);
    }
    ctx.lineTo(w, hgt);
    ctx.closePath();
    ctx.fill();

    // Identity reference
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.setLineDash([4 * dpr, 5 * dpr]);
    ctx.beginPath();
    ctx.moveTo(0, hgt);
    ctx.lineTo(w, 0);
    ctx.stroke();
    ctx.setLineDash([]);

    // The other channels' curves, faint, so a per-channel edit stays visible
    for (const def of CHANNELS) {
      if (def.id === channel || curveIsIdentity(curves[def.id])) continue;
      strokeCurve(curves[def.id], def.color, 0.35, 1.25 * dpr);
    }

    // The active curve
    const color = CHANNELS.find((c) => c.id === channel)?.color ?? "#fff";
    strokeCurve(curves[channel], color, 1, 2 * dpr);

    // Control points
    curves[channel].forEach((p, i) => {
      const active = i === dragging || i === hover;
      ctx.fillStyle = active ? color : "#141416";
      ctx.strokeStyle = color;
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      ctx.arc(p.x * w, hgt - p.y * hgt, (active ? 6 : 5) * dpr, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
  }

  function strokeCurve(points: CurvePoint[], color: string, alpha: number, width: number): void {
    if (!ctx) return;
    const w = canvas.width;
    const hgt = canvas.height;
    const lut = buildCurveLut(points);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * w;
      const y = hgt - (lut[i] / 255) * hgt;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // ── Interaction ──

  function toNorm(e: { clientX: number; clientY: number }): CurvePoint {
    const rect = canvas.getBoundingClientRect();
    return {
      x: clamp((e.clientX - rect.left) / Math.max(1, rect.width), 0, 1),
      y: clamp(1 - (e.clientY - rect.top) / Math.max(1, rect.height), 0, 1),
    };
  }

  function hitPoint(e: { clientX: number; clientY: number; pointerType?: string }): number | null {
    const rect = canvas.getBoundingClientRect();
    const pts = curves[channel];
    let best: number | null = null;
    let bestDist = e.pointerType === "touch" ? TOUCH_HIT_RADIUS : HIT_RADIUS;
    for (let i = 0; i < pts.length; i++) {
      const px = rect.left + pts[i].x * rect.width;
      const py = rect.top + (1 - pts[i].y) * rect.height;
      const dist = Math.hypot(e.clientX - px, e.clientY - py);
      if (dist <= bestDist) {
        best = i;
        bestDist = dist;
      }
    }
    return best;
  }

  function showReadout(index: number | null): void {
    if (index === null) {
      readout.textContent = HINT;
      return;
    }
    const p = curves[channel][index];
    readout.textContent = `Input ${Math.round(p.x * 255)} → Output ${Math.round(p.y * 255)}`;
  }

  function emit(): void {
    segmented.set(channel);
    paintChannels();
    options.onChange(structuredClone(curves));
  }

  canvas.addEventListener(
    "pointerdown",
    (e) => {
      e.preventDefault();
      let index = hitPoint(e);
      if (index === null) {
        const pts = curves[channel];
        if (pts.length >= MAX_POINTS) return;
        const pos = toNorm(e);
        pts.push(pos);
        pts.sort((a, b) => a.x - b.x);
        index = pts.indexOf(pos);
        emit();
      }
      dragging = index;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // synthetic pointers can't be captured
      }
      showReadout(index);
      draw();
    },
    { signal },
  );

  canvas.addEventListener(
    "pointermove",
    (e) => {
      if (dragging === null) {
        const next = hitPoint(e);
        canvas.classList.toggle("rt-curves__canvas--grab", next !== null);
        if (next !== hover) {
          hover = next;
          showReadout(hover);
          draw();
        }
        return;
      }
      const pts = curves[channel];
      const pos = toNorm(e);
      const first = dragging === 0;
      const last = dragging === pts.length - 1;
      const minX = first ? 0 : pts[dragging - 1].x + MIN_GAP;
      const maxX = last ? 1 : pts[dragging + 1].x - MIN_GAP;
      pts[dragging] = {
        // Endpoints stay pinned to the histogram edges.
        x: first ? 0 : last ? 1 : clamp(pos.x, minX, maxX),
        y: pos.y,
      };
      showReadout(dragging);
      draw();
      emit();
    },
    { signal },
  );

  const endDrag = (): void => {
    dragging = null;
    draw();
  };
  canvas.addEventListener("pointerup", endDrag, { signal });
  canvas.addEventListener("pointercancel", endDrag, { signal });
  canvas.addEventListener(
    "pointerleave",
    () => {
      if (dragging !== null) return;
      hover = null;
      showReadout(null);
      draw();
    },
    { signal },
  );

  canvas.addEventListener(
    "dblclick",
    (e) => {
      const index = hitPoint(e);
      const pts = curves[channel];
      if (index !== null && index > 0 && index < pts.length - 1) {
        pts.splice(index, 1);
        hover = null;
        showReadout(null);
        draw();
        emit();
      }
    },
    { signal },
  );

  // ── Channels ──

  const segmented = createSegmented(
    {
      label: "Channel",
      options: CHANNELS.map((c) => ({
        value: c.id,
        label: c.label,
        title: c.title,
        color: c.color,
      })),
      value: channel,
      onChange: (next) => {
        channel = next;
        hover = null;
        showReadout(null);
        draw();
      },
    },
    signal,
  );

  /** Mark channels whose curve has been shaped. */
  function paintChannels(): void {
    const buttons = segmented.root.querySelectorAll<HTMLElement>(".rt-segmented__btn");
    CHANNELS.forEach((def, i) => {
      buttons[i]?.classList.toggle("rt-segmented__btn--touched", !curveIsIdentity(curves[def.id]));
    });
  }
  paintChannels();

  const root = h("div", { class: "rt-curves" }, segmented.root, canvas, readout);

  if (typeof ResizeObserver !== "undefined") {
    const observer = new ResizeObserver(() => draw());
    observer.observe(canvas);
    signal.addEventListener("abort", () => observer.disconnect());
  }
  draw();

  return {
    root,
    setCurves(next) {
      curves = structuredClone(next);
      paintChannels();
      draw();
    },
    refreshHistogram() {
      histogram = options.getHistogram();
      draw();
    },
    destroy() {
      abort.abort();
    },
  };
}
