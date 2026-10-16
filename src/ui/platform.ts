/** True on Apple platforms, where shortcuts read ⌘ rather than Ctrl. */
export function isApple(): boolean {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  return /mac|iphone|ipad|ipod/i.test(nav.userAgentData?.platform || nav.platform || nav.userAgent);
}

/** A modifier shortcut as people read it: "⌘V" on a Mac, "Ctrl+V" elsewhere. */
export function shortcutLabel(key: string): string {
  return `${isApple() ? "⌘" : "Ctrl+"}${key}`;
}

/** True where the main input can't hover: phones and most tablets. */
export function isTouchFirst(): boolean {
  return (
    typeof matchMedia === "function" && matchMedia("(hover: none) and (pointer: coarse)").matches
  );
}
