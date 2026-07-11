import type { EditMask } from "../../types";
import { clamp } from "../../utils/math";
import type { CanvasRenderer } from "./canvas-renderer";

export interface MasksOverlayOptions {
  container: HTMLElement;
  renderer: CanvasRenderer;
  /** Fires while a handle is dragged with the mutated mask. */
  onGeometryChange: (mask: EditMask) => void;
}

export interface MasksOverlayHandle {
  root: HTMLElement;
  setVisible(visible: boolean): void;
  /** Re-render the gizmo for the given masks/selection. */
  update(masks: EditMask[], selectedId: string | null): void;
  /** Reposition after a canvas resize (same geometry, new pixels). */
  refresh(): void;
  destroy(): void;
}

const SVG_NS = "http://www.w3.org/2000/svg";

type HandleRole = "start" | "end" | "move";

/**
 * On-canvas gizmo for the selected mask: a draggable line (linear) or
 * ellipse (radial) with handle dots, mirroring the crop marquee's overlay
 * pattern.
 */
export function createMasksOverlay(options: MasksOverlayOptions): MasksOverlayHandle {
  const { container, renderer, onGeometryChange } = options;
  const abort = new AbortController();
  const signal = abort.signal;

  let masks: EditMask[] = [];
  let selectedId: string | null = null;

  const root = document.createElementNS(SVG_NS, "svg") as SVGSVGElement;
  root.setAttribute("class", "rt-mask-overlay");
  container.appendChild(root);

  const selected = (): EditMask | undefined => masks.find((m) => m.id === selectedId);

  // ── Coordinate mapping (normalized ↔ overlay px) ──

  function rect() {
    return renderer.getImageRect();
  }

  const toPx = (nx: number, ny: number) => {
    const r = rect();
    return { x: r.x + nx * r.width, y: r.y + ny * r.height };
  };

  // ── Rendering ──

  function el(name: string, attrs: Record<string, string>): SVGElement {
    const node = document.createElementNS(SVG_NS, name);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    return node;
  }

  function draw(): void {
    root.innerHTML = "";
    const mask = selected();
    if (!mask) return;
    const r = rect();
    root.setAttribute("viewBox", `0 0 ${Math.max(1, r.width)} ${Math.max(1, r.height)}`);
    root.setAttribute("width", String(r.width));
    root.setAttribute("height", String(r.height));

    if (mask.kind === "linear") {
      const a = toPx(mask.x0, mask.y0);
      const b = toPx(mask.x1, mask.y1);
      root.appendChild(
        el("line", {
          x1: String(a.x),
          y1: String(a.y),
          x2: String(b.x),
          y2: String(b.y),
          class: "rt-mask-overlay__line",
        }),
      );
      root.appendChild(handle(a.x, a.y, "start", "Full effect"));
      root.appendChild(handle(b.x, b.y, "end", "No effect"));
      root.appendChild(handle((a.x + b.x) / 2, (a.y + b.y) / 2, "move", "Move mask"));
    } else {
      const c = toPx(mask.x0, mask.y0);
      const rx = Math.abs(mask.x1 - mask.x0) * r.width;
      const ry = Math.abs(mask.y1 - mask.y0) * r.height;
      root.appendChild(
        el("ellipse", {
          cx: String(c.x),
          cy: String(c.y),
          rx: String(Math.max(6, rx)),
          ry: String(Math.max(6, ry)),
          class: "rt-mask-overlay__ellipse",
        }),
      );
      const e = toPx(mask.x1, mask.y1);
      root.appendChild(handle(c.x, c.y, "move", "Move mask"));
      root.appendChild(handle(e.x, e.y, "end", "Resize"));
    }
  }

  // ── Handle dragging ──

  let drag: { role: HandleRole; startX: number; startY: number; snapshot: EditMask } | null = null;

  function handle(x: number, y: number, role: HandleRole, title: string): SVGElement {
    const dot = el("circle", {
      cx: String(x),
      cy: String(y),
      r: "7",
      class: `rt-mask-overlay__handle rt-mask-overlay__handle--${role}`,
    });
    dot.appendChild(el("title", {})).textContent = title;
    dot.addEventListener(
      "pointerdown",
      (e) => {
        const mask = selected();
        if (!mask) return;
        e.preventDefault();
        e.stopPropagation();
        drag = {
          role,
          startX: (e as PointerEvent).clientX,
          startY: (e as PointerEvent).clientY,
          snapshot: structuredClone(mask),
        };
      },
      { signal },
    );
    return dot;
  }

  document.addEventListener(
    "pointermove",
    (e) => {
      if (!drag) return;
      const mask = selected();
      if (!mask) return;
      const r = rect();
      if (r.width === 0 || r.height === 0) return;
      const dx = (e.clientX - drag.startX) / r.width;
      const dy = (e.clientY - drag.startY) / r.height;
      const s = drag.snapshot;
      if (drag.role === "move") {
        mask.x0 = clamp(s.x0 + dx, 0, 1);
        mask.y0 = clamp(s.y0 + dy, 0, 1);
        mask.x1 = clamp(s.x1 + dx, -0.5, 1.5);
        mask.y1 = clamp(s.y1 + dy, -0.5, 1.5);
      } else if (drag.role === "start") {
        mask.x0 = clamp(s.x0 + dx, 0, 1);
        mask.y0 = clamp(s.y0 + dy, 0, 1);
      } else {
        mask.x1 = clamp(s.x1 + dx, -0.5, 1.5);
        mask.y1 = clamp(s.y1 + dy, -0.5, 1.5);
      }
      draw();
      onGeometryChange(structuredClone(mask));
    },
    { signal },
  );
  document.addEventListener(
    "pointerup",
    () => {
      drag = null;
    },
    { signal },
  );

  return {
    root: root as unknown as HTMLElement,
    setVisible(visible) {
      root.style.display = visible ? "" : "none";
    },
    update(nextMasks, nextSelected) {
      masks = structuredClone(nextMasks);
      selectedId = nextSelected;
      draw();
    },
    refresh: draw,
    destroy() {
      abort.abort();
      root.remove();
    },
  };
}
