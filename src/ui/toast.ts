import type { FileRejectionReason } from "../types";
import { h } from "./h";

export interface ToastHost {
  show(message: string, kind?: "error" | "info"): void;
  destroy(): void;
}

const DEFAULT_DURATION = 5000;

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

/** Transient, dismissible notifications stacked above the app. */
export function createToastHost(parent: HTMLElement = document.body): ToastHost {
  const root = h("div", { class: "rt-toasts", "aria-live": "polite" });
  parent.appendChild(root);

  function show(message: string, kind: "error" | "info" = "info"): void {
    const toast = h("div", { class: `rt-toast rt-toast--${kind}`, role: "status" }, message);
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
