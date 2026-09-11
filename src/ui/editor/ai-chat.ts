import type { AiOptions } from "../../types";
import { h } from "../h";
import { ICON_CLOSE, ICON_SEND, ICON_SPARKLE } from "../icons";

export interface AiChatOptions {
  ai: AiOptions;
  /** Runs the command; resolves with the applied-ops explanation. */
  onSubmit: (prompt: string) => Promise<string>;
}

export interface AiChatHandle {
  root: HTMLElement;
  /** Expand the chat panel and focus the input (⌘K). */
  open(): void;
  destroy(): void;
}

const KEY_STORAGE = "rt-ai-key";
const SPARKLE_ICON = ICON_SPARKLE;
const SEND_ICON = ICON_SEND;
const CLOSE_ICON = ICON_CLOSE;

export function getStoredAiKey(): string | null {
  try {
    return localStorage.getItem(KEY_STORAGE);
  } catch {
    return null;
  }
}

/**
 * AI entry point, top-right of the canvas: a labeled "✦ Ask AI ⌘K" pill that
 * expands into a vertical chat panel. Each prompt and its outcome are kept as
 * a session-scoped conversation, so refining an edit reads as a dialogue
 * rather than one-shot commands. The panel drags by its header and resizes
 * from its bottom-right corner.
 */
export function createAiChat(options: AiChatOptions): AiChatHandle {
  const abort = new AbortController();
  const signal = abort.signal;
  let busy = false;

  // ── Trigger pill ──

  const trigger = h("button", {
    class: "rt-ai__trigger",
    title: "Ask AI (⌘K)",
    "aria-label": "Ask AI to edit",
  });
  trigger.innerHTML = `${SPARKLE_ICON}<span>Ask AI</span><kbd class="rt-ai__kbd">⌘K</kbd>`;

  // ── Panel: header · messages · input ──

  const headerIcon = h("span", { class: "rt-ai__header-icon" });
  headerIcon.innerHTML = SPARKLE_ICON;
  const closeBtn = h("button", { class: "rt-ai__close", "aria-label": "Close AI chat" });
  closeBtn.innerHTML = CLOSE_ICON;
  const header = h(
    "div",
    { class: "rt-ai__header" },
    headerIcon,
    h("span", { class: "rt-ai__title" }, "AI edits"),
    closeBtn,
  );

  const messages = h("div", { class: "rt-ai__messages", role: "log", "aria-live": "polite" });
  const empty = h(
    "div",
    { class: "rt-ai__empty" },
    "Describe an edit — “moody and cinematic, crop to a square”. Follow-ups refine it.",
  );
  messages.appendChild(empty);

  const input = h("input", {
    type: "text",
    class: "rt-ai__input",
    placeholder: "Describe an edit…",
    "aria-label": "AI edit command",
  }) as HTMLInputElement;
  const sendBtn = h("button", {
    class: "rt-ai__send",
    title: "Apply (Enter)",
    "aria-label": "Apply",
  });
  sendBtn.innerHTML = SEND_ICON;
  const form = h("div", { class: "rt-ai__form" }, input, sendBtn);

  const panel = h("div", { class: "rt-ai__panel" }, header, messages, form);
  const root = h("div", { class: "rt-ai" }, panel, trigger);

  function addMessage(kind: "user" | "assistant" | "error" | "busy", text: string): HTMLElement {
    empty.remove();
    const msg = h("div", { class: `rt-ai__msg rt-ai__msg--${kind}` }, text);
    messages.appendChild(msg);
    messages.scrollTop = messages.scrollHeight;
    return msg;
  }

  // ── Open / close ──

  function open(): void {
    root.classList.add("rt-ai--open");
    input.focus();
    messages.scrollTop = messages.scrollHeight;
  }

  function close(): void {
    if (busy) return;
    root.classList.remove("rt-ai--open");
    root.querySelector(".rt-ai__popover")?.remove();
    input.blur();
  }

  trigger.addEventListener("click", open, { signal });
  closeBtn.addEventListener("click", close, { signal });

  // ── Drag by the header (position persists for the session) ──

  let dragId: number | null = null;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragOriginX = 0;
  let dragOriginY = 0;

  header.addEventListener(
    "pointerdown",
    (e) => {
      if (closeBtn.contains(e.target as Node)) return;
      const area = root.offsetParent as HTMLElement | null;
      if (!area) return;
      e.preventDefault();
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      dragOriginX = root.offsetLeft;
      dragOriginY = root.offsetTop;
      dragId = e.pointerId;
      try {
        header.setPointerCapture(e.pointerId);
      } catch {
        // Synthetic pointers can't be captured; move/up still bubble to us.
      }
      header.classList.add("rt-ai__header--dragging");
    },
    { signal },
  );
  header.addEventListener(
    "pointermove",
    (e) => {
      if (dragId !== e.pointerId) return;
      const area = root.offsetParent as HTMLElement | null;
      if (!area) return;
      const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);
      const x = clamp(
        dragOriginX + e.clientX - dragStartX,
        0,
        Math.max(0, area.clientWidth - root.offsetWidth),
      );
      const y = clamp(
        dragOriginY + e.clientY - dragStartY,
        0,
        Math.max(0, area.clientHeight - root.offsetHeight),
      );
      root.style.left = `${x}px`;
      root.style.top = `${y}px`;
      root.style.right = "auto";
      root.style.bottom = "auto";
    },
    { signal },
  );
  const endDrag = (e: PointerEvent) => {
    if (dragId !== e.pointerId) return;
    dragId = null;
    header.classList.remove("rt-ai__header--dragging");
  };
  header.addEventListener("pointerup", endDrag, { signal });
  header.addEventListener("pointercancel", endDrag, { signal });

  document.addEventListener(
    "pointerdown",
    (e) => {
      if (root.classList.contains("rt-ai--open") && !root.contains(e.target as Node)) {
        close();
      }
    },
    { signal },
  );

  // ── Key popover (end-user supplied key) ──

  function needsKeyEntry(): boolean {
    return !options.ai.complete && !options.ai.apiKey && !getStoredAiKey();
  }

  function showKeyPopover(): void {
    if (root.querySelector(".rt-ai__popover")) return;
    const keyInput = h("input", {
      type: "password",
      class: "rt-ai__key-input",
      placeholder: "sk-ant-…",
      "aria-label": "Anthropic API key",
    }) as HTMLInputElement;
    const saveBtn = h("button", { class: "rt-ai__save" }, "Save");
    const popover = h(
      "div",
      { class: "rt-ai__popover" },
      h(
        "div",
        { class: "rt-ai__popover-text" },
        "Paste an Anthropic API key to enable AI edits. Stored only in this browser (localStorage) — don't use a production key.",
      ),
      h("div", { class: "rt-ai__popover-row" }, keyInput, saveBtn),
    );
    saveBtn.addEventListener(
      "click",
      () => {
        const value = keyInput.value.trim();
        if (!value) return;
        try {
          localStorage.setItem(KEY_STORAGE, value);
        } catch {
          // storage unavailable — the key just won't persist
        }
        popover.remove();
        addMessage("assistant", "Key saved — ask away.");
        input.focus();
      },
      { signal },
    );
    panel.insertBefore(popover, form);
    keyInput.focus();
  }

  // ── Submit ──

  async function submit(): Promise<void> {
    const prompt = input.value.trim();
    if (!prompt || busy) return;
    if (needsKeyEntry()) {
      showKeyPopover();
      return;
    }
    busy = true;
    root.classList.add("rt-ai--busy");
    sendBtn.setAttribute("disabled", "");
    addMessage("user", prompt);
    const pending = addMessage("busy", "Thinking…");
    input.value = "";
    try {
      const explanation = await options.onSubmit(prompt);
      pending.textContent = explanation;
      pending.className = "rt-ai__msg rt-ai__msg--assistant";
    } catch (err) {
      pending.textContent = err instanceof Error ? err.message.replace("[Retouch] ", "") : "Failed";
      pending.className = "rt-ai__msg rt-ai__msg--error";
    } finally {
      busy = false;
      root.classList.remove("rt-ai--busy");
      sendBtn.removeAttribute("disabled");
      messages.scrollTop = messages.scrollHeight;
    }
  }

  sendBtn.addEventListener("click", () => void submit(), { signal });
  input.addEventListener(
    "keydown",
    (e) => {
      const key = (e as KeyboardEvent).key;
      if (key === "Enter") {
        e.preventDefault();
        void submit();
      } else if (key === "Escape") {
        // Consume so the editor's Esc-cancel doesn't fire underneath.
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    },
    { signal },
  );

  return {
    root,
    open,
    destroy() {
      abort.abort();
      root.remove();
    },
  };
}
