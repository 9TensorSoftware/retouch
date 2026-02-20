import { DEFAULT_HEIGHT, DEFAULT_WIDTH, PLACEHOLDER_BG, PLACEHOLDER_TEXT_COLOR } from "./constants";
import type { RetouchOptions, RetouchState } from "./types";
import { createCanvas, drawPlaceholder } from "./utils/canvas";

export class Retouch {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly container: HTMLElement;
  private readonly width: number;
  private readonly height: number;
  private _state: RetouchState = "idle";

  constructor(options: RetouchOptions) {
    if (typeof options.target === "string") {
      const el = document.querySelector<HTMLElement>(options.target);
      if (!el) {
        throw new Error(`[Retouch] Target element not found: ${options.target}`);
      }
      this.container = el;
    } else {
      this.container = options.target;
    }

    this.width = options.width ?? DEFAULT_WIDTH;
    this.height = options.height ?? DEFAULT_HEIGHT;

    this.canvas = createCanvas(this.width, this.height);
    const ctx = this.canvas.getContext("2d");
    if (!ctx) {
      throw new Error("[Retouch] Failed to get 2D rendering context");
    }
    this.ctx = ctx;

    this.mount();
  }

  get state(): RetouchState {
    return this._state;
  }

  get canvasElement(): HTMLCanvasElement {
    return this.canvas;
  }

  private mount(): void {
    this.container.appendChild(this.canvas);
    this.render();
    this._state = "mounted";
  }

  render(): void {
    drawPlaceholder(this.ctx, this.width, this.height, PLACEHOLDER_BG, PLACEHOLDER_TEXT_COLOR);
  }

  destroy(): void {
    if (this._state === "destroyed") return;
    this.canvas.remove();
    this._state = "destroyed";
  }
}
