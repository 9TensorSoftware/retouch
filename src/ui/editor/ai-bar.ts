import type { AiOptions } from "../../types";
import { h } from "../h";

export interface AiBarOptions {
  ai: AiOptions;
  /** Runs the command; resolves with the applied-ops explanation. */
  onSubmit: (prompt: string) => Promise<string>;
}

export interface AiBarHandle {
  root: HTMLElement;
  destroy(): void;
}

const KEY_STORAGE = "rt-ai-key";
const SPARKLE_ICON =
  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3zM19 15l.9 2.6L22.5 18.5l-2.6.9L19 22l-.9-2.6-2.6-.9 2.6-.9L19 15z"/></svg>';

export function hasAiKey(ai: AiOptions): boolean {
  if (ai.complete || ai.apiKey) return true;
  if (ai.allowUserKey) {
    try {
      return Boolean(localStorage.getItem(KEY_STORAGE));
    } catch {
      return false;
    }
  }
  return false;
}

export function getStoredAiKey(): string | null {
  try {
    return localStorage.getItem(KEY_STORAGE);
  } catch {
    return null;
  }
}

export function createAiBar(options: AiBarOptions): AiBarHandle {
  const abort = new AbortController();
  const signal = abort.signal;
  let busy = false;
  let chipTimer = 0;

  const icon = h("span", { class: "rt-ai-bar__icon" });
  icon.innerHTML = SPARKLE_ICON;

  const input = h("input", {
    type: "text",
    class: "rt-ai-bar__input",
    placeholder: "Tell Rétouch what to do — e.g. “make it B&W and crop to a square”",
    "aria-label": "AI edit command",
  }) as HTMLInputElement;

  const submitBtn = h("button", { class: "rt-ai-bar__submit", title: "Apply (Enter)" }, "Apply");
  const statusEl = h("span", { class: "rt-ai-bar__status" });

  const root = h("div", { class: "rt-ai-bar" }, icon, input, submitBtn, statusEl);

  // ── Key popover (end-user supplied key) ──

  function needsKeyEntry(): boolean {
    return !options.ai.complete && !options.ai.apiKey && !getStoredAiKey();
  }

  function showKeyPopover(): void {
    if (root.querySelector(".rt-ai-bar__popover")) return;
    const keyInput = h("input", {
      type: "password",
      class: "rt-ai-bar__key-input",
      placeholder: "sk-ant-…",
      "aria-label": "Anthropic API key",
    }) as HTMLInputElement;
    const saveBtn = h("button", { class: "rt-ai-bar__submit" }, "Save");
    const popover = h(
      "div",
      { class: "rt-ai-bar__popover" },
      h(
        "div",
        { class: "rt-ai-bar__popover-text" },
        "Paste an Anthropic API key to enable AI edits. Stored only in this browser (localStorage) — don't use a production key.",
      ),
      h("div", { class: "rt-ai-bar__popover-row" }, keyInput, saveBtn),
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
        setStatus("Key saved", "ok");
      },
      { signal },
    );
    root.appendChild(popover);
    keyInput.focus();
  }

  // ── Status / submit ──

  function setStatus(text: string, kind: "ok" | "error" | "busy" | ""): void {
    statusEl.textContent = text;
    statusEl.className = `rt-ai-bar__status${kind ? ` rt-ai-bar__status--${kind}` : ""}`;
    clearTimeout(chipTimer);
    if (kind === "ok") {
      chipTimer = window.setTimeout(() => setStatus("", ""), 4000);
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
    root.classList.add("rt-ai-bar--busy");
    submitBtn.setAttribute("disabled", "");
    setStatus("Thinking…", "busy");
    try {
      const explanation = await options.onSubmit(prompt);
      input.value = "";
      setStatus(explanation, "ok");
    } catch (err) {
      setStatus(err instanceof Error ? err.message.replace("[Retouch] ", "") : "Failed", "error");
    } finally {
      busy = false;
      root.classList.remove("rt-ai-bar--busy");
      submitBtn.removeAttribute("disabled");
    }
  }

  submitBtn.addEventListener("click", () => void submit(), { signal });
  input.addEventListener(
    "keydown",
    (e) => {
      if ((e as KeyboardEvent).key === "Enter") {
        e.preventDefault();
        void submit();
      }
    },
    { signal },
  );

  return {
    root,
    destroy() {
      clearTimeout(chipTimer);
      abort.abort();
      root.remove();
    },
  };
}
