import type { FileRejectionReason } from "../types";
import { h } from "./h";
import { ICON_ALERT, ICON_CHECK, ICON_INFO } from "./icons";

export type ToastKind = "error" | "info" | "success";

export interface ToastHost {
  show(message: string, kind?: ToastKind): void;
  destroy(): void;
}

const DEFAULT_DURATION = 5000;

const KIND_ICONS: Record<ToastKind, string> = {
  error: ICON_ALERT,
  info: ICON_INFO,
  success: ICON_CHECK,
};

/** Human-readable message for a rejected file. */
export function rejectionMessage(name: string, reason: FileRejectionReason): string {
  switch (reason) {
    case "type":
      return `"${name}" — unsupported file type`;
    case "size":
      return `"${name}" is too large`;
    case "duration":
      return `"${name}" is too long`;
    case "count":
      return `"${name}" skipped — file limit reached`;
    case "load-error":
      return `"${name}" couldn't be loaded`;
  }
}

/**
 * Transient, dismissible notifications. They sit along the bottom edge in the
 * gallery and just under the top bar while the editor is open (see the
 * stylesheet), so they never cover a control.
 */
export function createToastHost(parent: HTMLElement = document.body): ToastHost {
  const root = h("div", { class: "rt-toasts", "aria-live": "polite" });
  parent.appendChild(root);

  function show(message: string, kind: ToastKind = "info"): void {
    const icon = h("span", { class: "rt-toast__icon", "aria-hidden": "true" });
    icon.innerHTML = KIND_ICONS[kind];
    const toast = h(
      "div",
      // Errors interrupt; everything else waits its turn.
      { class: `rt-toast rt-toast--${kind}`, role: kind === "error" ? "alert" : "status" },
      icon,
      h("span", { class: "rt-toast__text" }, message),
    );
    root.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("rt-toast--visible"));

    let removed = false;
    const remove = (): void => {
      if (removed) return;
      removed = true;
      toast.classList.remove("rt-toast--visible");
      // Remove after the fade, with a fallback in case transitionend doesn't fire.
      toast.addEventListener("transitionend", () => toast.remove(), { once: true });
      setTimeout(() => toast.remove(), 300);
    };
    toast.addEventListener("click", remove);
    setTimeout(remove, DEFAULT_DURATION);
  }

  return {
    show,
    destroy() {
      root.remove();
    },
  };
}
