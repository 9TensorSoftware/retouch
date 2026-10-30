import type { Detection, Point, TextLine } from "../packages/ml/src/index";

// The AI section's two labs: a photo with what a model found drawn over it,
// and a list of the same findings beside it. Pointing at either side lights
// up its partner on the other.

type Quad = TextLine["quad"];

export interface LabItem {
  /** What the list says: a class name, or the text read. */
  label: string;
  score: number;
  /** Corners, normalized 0–1, clockwise from top-left. */
  quad: Quad;
  color: string;
}

export interface Lab {
  /** Draw a new set of findings; `animate` staggers them in. */
  show(items: LabItem[], animate?: boolean): void;
  status(text: string): void;
}

const SVG = "http://www.w3.org/2000/svg";

/** The prism's colors, then the accent, handed out one per kind of thing. */
const PALETTE = ["#5cc8ff", "#ffc457", "#8ce99a", "#a58bff", "#ff9068", "#ff7eb6"];

export function boxQuad(d: Pick<Detection, "x" | "y" | "w" | "h">): Quad {
  return [
    [d.x, d.y],
    [d.x + d.w, d.y],
    [d.x + d.w, d.y + d.h],
    [d.x, d.y + d.h],
  ];
}

/** Detections as lab items, one color per class in order of first sighting. */
export function detectionItems(found: Detection[]): LabItem[] {
  const colors = new Map<string, string>();
  return [...found]
    .sort((a, b) => b.score - a.score)
    .map((d) => {
      const label = d.label ?? "face";
      if (!colors.has(label)) colors.set(label, PALETTE[colors.size % PALETTE.length]);
      return { label, score: d.score, quad: boxQuad(d), color: colors.get(label) as string };
    });
}

/** Text lines as lab items, all in the editor's own green. */
export function textItems(lines: Pick<TextLine, "text" | "score" | "quad">[]): LabItem[] {
  return lines.map((l) => ({ label: l.text, score: l.score, quad: l.quad, color: "#5ed278" }));
}

/** Axis-aligned bounds of a quad, for the reading-order helpers. */
export function withBounds<T extends { quad: Quad; score: number }>(item: T): T & Detection {
  const xs = item.quad.map((p: Point) => p[0]);
  const ys = item.quad.map((p: Point) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { ...item, x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

export function mountLab(root: HTMLElement, options: { tags: boolean }): Lab {
  const marks = root.querySelector<SVGSVGElement>(".lab__marks");
  const tags = root.querySelector<HTMLElement>(".lab__tags");
  const list = root.querySelector<HTMLOListElement>(".lab__list");
  const status = root.querySelector<HTMLElement>(".lab__status");
  if (!marks || !tags || !list || !status) throw new Error("Lab markup is incomplete");
  let pinned: number | null = null;

  function focus(index: number | null): void {
    root.toggleAttribute("data-focus", index !== null);
    for (const el of root.querySelectorAll<Element>("[data-i]")) {
      el.classList.toggle(
        "is-focus",
        index !== null && el.getAttribute("data-i") === String(index),
      );
    }
  }

  function bind(el: Element, index: number): void {
    el.setAttribute("data-i", String(index));
    el.addEventListener("pointerenter", () => focus(index));
    el.addEventListener("pointerleave", () => focus(pinned));
    // Taps pin a finding (and tap again to let go): there's no hover on touch.
    el.addEventListener("click", () => {
      pinned = pinned === index ? null : index;
      focus(pinned);
    });
  }

  return {
    show(items, animate = false) {
      pinned = null;
      focus(null);
      root.classList.toggle("is-live", animate);
      marks.replaceChildren();
      tags.replaceChildren();
      list.replaceChildren();
      items.forEach((item, i) => {
        const delay = `${animate ? i * 70 : 0}ms`;
        const shape = document.createElementNS(SVG, "polygon");
        shape.setAttribute("points", item.quad.map(([x, y]) => `${x},${y}`).join(" "));
        shape.setAttribute("vector-effect", "non-scaling-stroke");
        shape.style.setProperty("--c", item.color);
        shape.style.setProperty("--d", delay);
        bind(shape, i);
        marks.append(shape);

        if (options.tags) {
          const [x, y] = item.quad[0];
          const tag = document.createElement("span");
          tag.className = "lab__tag";
          tag.textContent = item.label;
          tag.style.cssText = `left:${x * 100}%;top:${y * 100}%;--c:${item.color};--d:${delay}`;
          tag.setAttribute("data-i", String(i));
          tags.append(tag);
        }

        const row = document.createElement("li");
        row.tabIndex = 0;
        row.style.setProperty("--c", item.color);
        row.style.setProperty("--d", delay);
        const name = document.createElement("span");
        name.className = "lab__label";
        name.textContent = item.label;
        const meter = document.createElement("span");
        meter.className = "lab__meter";
        meter.style.setProperty("--v", String(item.score));
        const score = document.createElement("span");
        score.className = "lab__score";
        score.textContent = `${Math.round(item.score * 100)}%`;
        row.append(name, meter, score);
        row.addEventListener("focus", () => focus(i));
        row.addEventListener("blur", () => focus(pinned));
        bind(row, i);
        list.append(row);
      });
    },
    status(text) {
      status.textContent = text;
    },
  };
}
