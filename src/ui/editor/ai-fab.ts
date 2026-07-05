import type { AiOptions } from "../../types";
import { h } from "../h";

export interface AiFabOptions {
  ai: AiOptions;
  /** Runs the command; resolves with the applied-ops explanation. */
  onSubmit: (prompt: string) => Promise<string>;
}

export interface AiFabHandle {
  root: HTMLElement;
  /** Expand the input and focus it (⌘K). */
  open(): void;
  destroy(): void;
}

const KEY_STORAGE = "rt-ai-key";
const SPARKLE_ICON =
  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3zM19 15l.9 2.6L22.5 18.5l-2.6.9L19 22l-.9-2.6-2.6-.9 2.6-.9L19 15z"/></svg>';
const SEND_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';

export function getStoredAiKey(): string | null {
  try {
    return localStorage.getItem(KEY_STORAGE);
  } catch {
    return null;
  }
}

/**
 * Floating AI entry point: a sparkle button hovering over the canvas that
 * expands into a pill-shaped prompt when summoned (click or ⌘K), and gets out
 * of the way otherwise.
 */
export function createAiFab(options: AiFabOptions): AiFabHandle {
  const abort = new AbortController();
  const signal = abort.signal;
  let busy = false;
  let chipTimer = 0;

  // ── Elements (stacked bottom-up: trigger/panel, chip, popover) ──

  const trigger = h("button", {
    class: "rt-ai-fab__trigger",
    title: "Ask AI (⌘K)",
    "aria-label": "Ask AI to edit",
  });
  trigger.innerHTML = SPARKLE_ICON;

  const icon = h("span", { class: "rt-ai-fab__icon" });
  icon.innerHTML = SPARKLE_ICON;
  const input = h("input", {
    type: "text",
    class: "rt-ai-fab__input",
    placeholder: "Describe an edit — “moody and cinematic, crop to a square”",
    "aria-label": "AI edit command",
  }) as HTMLInputElement;
  const sendBtn = h("button", {
    class: "rt-ai-fab__send",
    title: "Apply (Enter)",
    "aria-label": "Apply",
  });
  sendBtn.innerHTML = SEND_ICON;
  const panel = h("div", { class: "rt-ai-fab__panel" }, icon, input, sendBtn);

  const chip = h("div", { class: "rt-ai-fab__chip", role: "status" });

  const root = h("div", { class: "rt-ai-fab" }, chip, panel, trigger);

  // ── Open / close ──

  function open(): void {
    root.classList.add("rt-ai-fab--open");
    input.focus();
  }

  function close(): void {
    if (busy) return;
    root.classList.remove("rt-ai-fab--open");
    setChip("", "");
    root.querySelector(".rt-ai-fab__popover")?.remove();
    input.blur();
  }

  trigger.addEventListener("click", open, { signal });

  document.addEventListener(
    "pointerdown",
    (e) => {
      if (root.classList.contains("rt-ai-fab--open") && !root.contains(e.target as Node)) {
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
    if (root.querySelector(".rt-ai-fab__popover")) return;
    const keyInput = h("input", {
      type: "password",
      class: "rt-ai-fab__key-input",
      placeholder: "sk-ant-…",
      "aria-label": "Anthropic API key",
    }) as HTMLInputElement;
    const saveBtn = h("button", { class: "rt-ai-fab__save" }, "Save");
    const popover = h(
      "div",
      { class: "rt-ai-fab__popover" },
      h(
        "div",
        { class: "rt-ai-fab__popover-text" },
        "Paste an Anthropic API key to enable AI edits. Stored only in this browser (localStorage) — don't use a production key.",
      ),
      h("div", { class: "rt-ai-fab__popover-row" }, keyInput, saveBtn),
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
        setChip("Key saved — ask away", "ok");
        input.focus();
      },
      { signal },
    );
    root.insertBefore(popover, chip);
    keyInput.focus();
  }

  // ── Status chip / submit ──

  function setChip(text: string, kind: "ok" | "error" | "busy" | ""): void {
    chip.textContent = text;
    chip.className = `rt-ai-fab__chip${kind ? ` rt-ai-fab__chip--${kind} rt-ai-fab__chip--visible` : ""}`;
    clearTimeout(chipTimer);
    if (kind === "ok") {
      // Job done — tuck the pill back into the sparkle (close clears the chip).
      chipTimer = window.setTimeout(close, 2600);
    }
  }

  async function submit(): Promise<void> {
    const prompt = input.value.trim();
    if (!prompt || busy) return;
    if (needsKeyEntry()) {
      showKeyPopover();
      return;
    }
    busy = true;
    root.classList.add("rt-ai-fab--busy");
    sendBtn.setAttribute("disabled", "");
    setChip("Thinking…", "busy");
    try {
      const explanation = await options.onSubmit(prompt);
      input.value = "";
      busy = false;
      setChip(explanation, "ok");
    } catch (err) {
      busy = false;
      setChip(err instanceof Error ? err.message.replace("[Retouch] ", "") : "Failed", "error");
    } finally {
      root.classList.remove("rt-ai-fab--busy");
      sendBtn.removeAttribute("disabled");
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
      clearTimeout(chipTimer);
      abort.abort();
      root.remove();
    },
  };
}
