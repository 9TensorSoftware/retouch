type Attrs = Record<string, string | number | boolean | EventListener>;
type Child = Node | string;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Attrs | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);

  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (key.startsWith("on") && typeof value === "function") {
        el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
      } else if (typeof value === "boolean") {
        if (value) el.setAttribute(key, "");
      } else {
        el.setAttribute(key, String(value));
      }
    }
  }

  for (const child of children) {
    el.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  }

  return el;
}
