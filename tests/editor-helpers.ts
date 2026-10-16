import { DEFAULT_EDITS } from "../src/constants";
import type { ImageEntry } from "../src/types";

/**
 * jsdom has no layout, and the editor sizes its canvas (and the crop
 * marquee) from its container's box, so give every element a plausible
 * size. Returns a restore function.
 */
export function stubLayout(width: number, height: number): () => void {
  const proto = HTMLElement.prototype;
  const saved = (["clientWidth", "clientHeight"] as const).map(
    (key) => [key, Object.getOwnPropertyDescriptor(proto, key)] as const,
  );
  Object.defineProperty(proto, "clientWidth", { configurable: true, get: () => width });
  Object.defineProperty(proto, "clientHeight", { configurable: true, get: () => height });
  return () => {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(proto, key, descriptor);
      else Reflect.deleteProperty(proto, key);
    }
  };
}

/** A 1600×900 image entry with default edits. */
export function makeImageEntry(): ImageEntry {
  const image = new Image();
  Object.defineProperty(image, "naturalWidth", { value: 1600 });
  Object.defineProperty(image, "naturalHeight", { value: 900 });
  return {
    id: "fjord",
    kind: "image",
    file: new File(["x"], "fjord.jpg", { type: "image/jpeg" }),
    image,
    edits: structuredClone(DEFAULT_EDITS),
    edited: false,
  } as unknown as ImageEntry;
}
