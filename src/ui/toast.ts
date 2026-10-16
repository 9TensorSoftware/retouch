import type { FileRejectionReason } from "../types";
import { formatBytes, formatNames, formatSpan, listOr } from "../utils/formats";
import { h } from "./h";
import { ICON_ALERT, ICON_CHECK, ICON_INFO } from "./icons";

export type ToastKind = "error" | "info" | "success";

export interface ToastOptions {
  /** A second, quieter line under the message: what to do about it. */
  detail?: string;
  /** One button, such as Undo or View. Pressing it also dismisses the toast. */
  action?: { label: string; onClick: () => void };
  /** How long it stays, in ms. Pointing at it or focusing it stops the clock. */
  duration?: number;
  /** Called once it's gone, however it went. */
  onDismiss?: () => void;
}

export interface Toast {
  dismiss(): void;
}

export interface ToastHost {
  show(message: string, kind?: ToastKind, options?: ToastOptions): Toast;
  destroy(): void;
}

const DEFAULT_DURATION = 5000;
/** A toast with a button stays longer: there's something to decide. */
const ACTION_DURATION = 8000;
/** At most this many at once; the oldest makes room. */
const MAX_VISIBLE = 3;

const KIND_ICONS: Record<ToastKind, string> = {
  error: ICON_ALERT,
  info: ICON_INFO,
  success: ICON_CHECK,
};

/** Human-readable message for a rejected file. */
export function rejectionMessage(name: string, reason: FileRejectionReason): string {
  switch (reason) {
    case "type":
      return `"${name}" is an unsupported file type`;
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

/** The limits a rejection is measured against. */
export interface RejectionLimits {
  /** Every accepted MIME type, images and videos. */
  types: string[];
  maxFileSize: number;
  maxVideoDuration: number;
  maxFiles: number;
}

/** The line under a rejection: what would have worked. */
export function rejectionDetail(reason: FileRejectionReason, limits: RejectionLimits): string {
  switch (reason) {
    case "type":
      return `Use ${listOr(formatNames(limits.types))}.`;
    case "size":
      return Number.isFinite(limits.maxFileSize)
        ? `Files up to ${formatBytes(limits.maxFileSize)} work.`
        : "The file is larger than this app allows.";
    case "duration":
      return Number.isFinite(limits.maxVideoDuration)
        ? `Videos up to ${formatSpan(limits.maxVideoDuration)} work.`
        : "The video is longer than this app allows.";
    case "count":
      return `The gallery holds ${limits.maxFiles} ${limits.maxFiles === 1 ? "file" : "files"}.`;
    case "load-error":
      return "It may be damaged, or in a format this browser can't decode.";
  }
}

const REASON_SHORT: Record<FileRejectionReason, string> = {
  type: "unsupported",
  size: "too large",
  duration: "too long",
  count: "over the limit",
  "load-error": "unreadable",
};

/** One toast for a batch of rejections: "3 files couldn't be added" · "2 unsupported · 1 too large". */
export function rejectionSummary(reasons: FileRejectionReason[]): {
  message: string;
  detail: string;
} {
  const counts = new Map<FileRejectionReason, number>();
  for (const reason of reasons) counts.set(reason, (counts.get(reason) ?? 0) + 1);
  return {
    message: `${reasons.length} files couldn't be added`,
    detail: [...counts].map(([reason, n]) => `${n} ${REASON_SHORT[reason]}`).join(" · "),
  };
}

/**
 * Transient notifications: an icon for the severity, the message, an
 * optional detail line and at most one action. They sit along the bottom
 * edge in the gallery and just under the top bar while the editor is open
 * (see the stylesheet), so they never cover a control.
 */
export function createToastHost(parent: HTMLElement = document.body): ToastHost {
  const root = h("div", { class: "rt-toasts", "aria-live": "polite" });
  parent.appendChild(root);
  const live: Toast[] = [];

  function show(message: string, kind: ToastKind = "info", options: ToastOptions = {}): Toast {
    const icon = h("span", { class: "rt-toast__icon", "aria-hidden": "true" });
    icon.innerHTML = KIND_ICONS[kind];
    const body = h(
      "span",
      { class: "rt-toast__body" },
      h("span", { class: "rt-toast__text" }, message),
    );
    if (options.detail) {
      body.appendChild(h("span", { class: "rt-toast__detail" }, options.detail));
    }
    const toast = h(
      "div",
      // Errors interrupt; everything else waits its turn.
      { class: `rt-toast rt-toast--${kind}`, role: kind === "error" ? "alert" : "status" },
      icon,
      body,
    );
    if (options.action) {
      const { label, onClick } = options.action;
      const button = h("button", { type: "button", class: "rt-toast__action" }, label);
      button.addEventListener("click", () => onClick());
      toast.appendChild(button);
    }
    root.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("rt-toast--visible"));

    let removed = false;
    const handle: Toast = { dismiss: remove };
    function remove(): void {
      if (removed) return;
      removed = true;
      clearTimeout(timer);
      const index = live.indexOf(handle);
      if (index >= 0) live.splice(index, 1);
      toast.classList.remove("rt-toast--visible");
      // Remove after the fade, with a fallback in case transitionend doesn't fire.
      toast.addEventListener("transitionend", () => toast.remove(), { once: true });
      setTimeout(() => toast.remove(), 300);
      options.onDismiss?.();
    }

    // The clock runs only while nobody is reading or reaching for it.
    let left = options.duration ?? (options.action ? ACTION_DURATION : DEFAULT_DURATION);
    let deadline = Date.now() + left;
    let timer: ReturnType<typeof setTimeout> | undefined = setTimeout(remove, left);
    let hovered = false;
    let focused = false;
    const sync = (): void => {
      const hold = hovered || focused;
      if (hold && timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
        left = Math.max(1500, deadline - Date.now());
      } else if (!hold && timer === undefined && !removed) {
        deadline = Date.now() + left;
        timer = setTimeout(remove, left);
      }
    };
    toast.addEventListener("mouseenter", () => {
      hovered = true;
      sync();
    });
    toast.addEventListener("mouseleave", () => {
      hovered = false;
      sync();
    });
    toast.addEventListener("focusin", () => {
      focused = true;
      sync();
    });
    toast.addEventListener("focusout", () => {
      focused = false;
      sync();
    });
    toast.addEventListener("click", remove);

    live.push(handle);
    if (live.length > MAX_VISIBLE) live[0].dismiss();
    return handle;
  }

  return {
    show,
    destroy() {
      root.remove();
    },
  };
}
