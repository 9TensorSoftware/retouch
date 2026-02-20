export interface RetouchOptions {
  /** Target DOM element or CSS selector to mount the canvas into. */
  target: string | HTMLElement;
  /** Canvas width in pixels. Defaults to 800. */
  width?: number;
  /** Canvas height in pixels. Defaults to 600. */
  height?: number;
}

export type RetouchState = "idle" | "mounted" | "destroyed";
