import type { CurvePoint, Curves } from "../../types";
import { buildCurveLut } from "../../utils/curves";
import { clamp } from "../../utils/math";
import { h } from "../h";

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

const CHANNELS: { id: Channel; label: string; color: string }[] = [
  { id: "master", label: "RGB", color: "#EDEDED" },
  { id: "r", label: "R", color: "#E06C5A" },
  { id: "g", label: "G", color: "#6CC46C" },
  { id: "b", label: "B", color: "#5A8FE0" },
];

const WIDTH = 196;
const HEIGHT = 104;
const HIT_RADIUS = 10;
const MAX_POINTS = 16;
const MIN_GAP = 0.02;

/**
 * Tone-curve editor: drag points, click the curve to add one, double-click a
 * point to remove it. One curve per channel with the input histogram behind.
 */
export function createCurvesTool(options: CurvesToolOptions): CurvesToolHandle {
  const abort = new AbortController();
  const signal = abort.signal;
  let curves: Curves = structuredClone(options.curves);
  let channel: Channel = "master";
  let histogram: Uint32Array = new Uint32Array(256);
  let dragging: number | null = null;

  const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
  const canvas = h("canvas", {
    class: "rt-curves__canvas",
    width: WIDTH * dpr,
    height: HEIGHT * dpr,
    "aria-label": "Tone curve editor",
  }) as HTMLCanvasElement;
  const ctx = canvas.getContext("2d");

  // ── Drawing ──

  function draw(): void {
    if (!ctx) return;
    const w = WIDTH * dpr;
    const hgt = HEIGHT * dpr;
    ctx.clearRect(0, 0, w, hgt);

    // Panel + quarter grid. Canvas can't read CSS custom properties, so
    // these literals mirror the darkroom tokens in styles.ts
    // (--rt-surface-wash / --rt-line / histogram ≈ --rt-control-hover).
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fillRect(0, 0, w, hgt);
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.lineWidth = dpr;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo((w * i) / 4, 0);
      ctx.lineTo((w * i) / 4, hgt);
      ctx.moveTo(0, (hgt * i) / 4);
      ctx.lineTo(w, (hgt * i) / 4);
      ctx.stroke();
    }

    // Histogram (sqrt scale reads better than linear)
    const peak = Math.sqrt(Math.max(1, ...histogram));
    ctx.fillStyle = "rgba(255,255,255,0.13)";
    for (let i = 0; i < 256; i++) {
      const barH = (Math.sqrt(histogram[i]) / peak) * hgt;
      if (barH > 0) ctx.fillRect((i / 256) * w, hgt - barH, w / 256 + 1, barH);
    }

    // Identity reference
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.setLineDash([4 * dpr, 4 * dpr]);
    ctx.beginPath();
    ctx.moveTo(0, hgt);
    ctx.lineTo(w, 0);
    ctx.stroke();
    ctx.setLineDash([]);

    // Curve for the active channel
    const color = CHANNELS.find((c) => c.id === channel)?.color ?? "#fff";
    const lut = buildCurveLut(curves[channel]);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * w;
      const y = hgt - (lut[i] / 255) * hgt;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Control points
    for (const p of curves[channel]) {
      const x = p.x * w;
      const y = hgt - p.y * hgt;
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = color;
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      ctx.arc(x, y, 4 * dpr, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  // ── Interaction ──

  function toNorm(e: PointerEvent): CurvePoint {
    const rect = canvas.getBoundingClientRect();
    return {
      x: clamp((e.clientX - rect.left) / rect.width, 0, 1),
      y: clamp(1 - (e.clientY - rect.top) / rect.height, 0, 1),
    };
  }

  function hitPoint(pos: CurvePoint): number | null {
    const pts = curves[channel];
    const rx = HIT_RADIUS / WIDTH;
    const ry = HIT_RADIUS / HEIGHT;
    for (let i = 0; i < pts.length; i++) {
      if (Math.abs(pts[i].x - pos.x) < rx && Math.abs(pts[i].y - pos.y) < ry) return i;
    }
    return null;
  }

  function emit(): void {
    options.onChange(structuredClone(curves));
  }

  canvas.addEventListener(
    "pointerdown",
    (e) => {
      e.preventDefault();
      const pos = toNorm(e);
      let index = hitPoint(pos);
      if (index === null) {
        const pts = curves[channel];
        if (pts.length >= MAX_POINTS) return;
        pts.push(pos);
        pts.sort((a, b) => a.x - b.x);
        index = pts.indexOf(pos);
      }
      dragging = index;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // synthetic pointers can't be captured
      }
      draw();
      emit();
    },
    { signal },
  );

  canvas.addEventListener(
    "pointermove",
    (e) => {
      if (dragging === null) return;
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
      draw();
      emit();
    },
    { signal },
  );

  const endDrag = () => {
    dragging = null;
  };
  canvas.addEventListener("pointerup", endDrag, { signal });
  canvas.addEventListener("pointercancel", endDrag, { signal });

  canvas.addEventListener(
    "dblclick",
    (e) => {
      const pos = toNorm(e as unknown as PointerEvent);
      const index = hitPoint(pos);
      const pts = curves[channel];
      if (index !== null && index > 0 && index < pts.length - 1) {
        pts.splice(index, 1);
        draw();
        emit();
      }
    },
    { signal },
  );

  // ── Channel chips + reset ──

  const chipEls = new Map<Channel, HTMLElement>();
  const chipColumn = h("div", { class: "rt-curves__channels" });
  for (const def of CHANNELS) {
    const chip = h(
      "button",
      {
        class: `rt-dock__chip rt-curves__chip${def.id === channel ? " rt-dock__chip--active" : ""}`,
        title: def.id === "master" ? "All channels" : `${def.label} channel`,
      },
      def.label,
    );
    chip.style.setProperty("--rt-curve-color", def.color);
    chip.addEventListener(
      "click",
      () => {
        chipEls.get(channel)?.classList.remove("rt-dock__chip--active");
        channel = def.id;
        chipEls.get(channel)?.classList.add("rt-dock__chip--active");
        draw();
      },
      { signal },
    );
    chipEls.set(def.id, chip);
    chipColumn.appendChild(chip);
  }

  const resetBtn = h(
    "button",
    { class: "rt-dock__chip rt-curves__chip", title: "Reset this channel's curve" },
    "Reset",
  );
  resetBtn.addEventListener(
    "click",
    () => {
      curves[channel] = [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ];
      draw();
      emit();
    },
    { signal },
  );

  const root = h(
    "div",
    { class: "rt-curves rt-dock__row" },
    chipColumn,
    canvas,
    h("div", { class: "rt-curves__side" }, resetBtn),
  );

  draw();

  return {
    root,
    setCurves(next) {
      curves = structuredClone(next);
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
