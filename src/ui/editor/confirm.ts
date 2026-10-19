import { h } from "../h";

/** What the person chose: the main action, the other one, or neither. */
export type ConfirmChoice = "confirm" | "discard" | "stay";

export interface ConfirmQuestion {
  title: string;
  detail?: string;
  /** The main action, focused when the question opens. */
  confirmLabel: string;
  discardLabel: string;
}

export interface ConfirmHandle {
  /**
   * Ask over the editor. Esc, or a click outside the card, answers "stay".
   * Asking while a question is open returns that question's answer.
   */
  ask(question: ConfirmQuestion): Promise<ConfirmChoice>;
  readonly open: boolean;
}

let nextId = 0;

/** A small modal question inside `host` (the editor overlay). */
export function createConfirm(host: HTMLElement, signal: AbortSignal): ConfirmHandle {
  let current: Promise<ConfirmChoice> | null = null;

  function ask(question: ConfirmQuestion): Promise<ConfirmChoice> {
    if (current) return current;
    const id = `rt-confirm-${++nextId}`;
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const discard = h(
      "button",
      { type: "button", class: "rt-dock__chip rt-confirm__btn" },
      question.discardLabel,
    );
    const confirm = h(
      "button",
      { type: "button", class: "rt-dock__chip rt-dock__chip--primary rt-confirm__btn" },
      question.confirmLabel,
    );
    const card = h(
      "div",
      {
        class: "rt-confirm__card",
        role: "alertdialog",
        "aria-modal": "true",
        "aria-labelledby": `${id}-title`,
      },
      h("p", { class: "rt-confirm__title", id: `${id}-title` }, question.title),
    );
    if (question.detail) {
      card.setAttribute("aria-describedby", `${id}-detail`);
      card.appendChild(
        h("p", { class: "rt-confirm__detail", id: `${id}-detail` }, question.detail),
      );
    }
    card.appendChild(h("div", { class: "rt-confirm__actions" }, discard, confirm));
    const scrim = h("div", { class: "rt-confirm" }, card);

    current = new Promise<ConfirmChoice>((resolve) => {
      const local = new AbortController();
      const listen = { signal: local.signal };
      const answer = (choice: ConfirmChoice): void => {
        local.abort();
        scrim.remove();
        current = null;
        before?.focus({ preventScroll: true });
        resolve(choice);
      };
      // Keys go to the question first, and no further: the editor's own
      // shortcuts (Esc cancels it, Enter applies a crop) wait until it's answered.
      document.addEventListener(
        "keydown",
        (e) => {
          e.stopPropagation();
          if (e.key === "Escape") {
            e.preventDefault();
            answer("stay");
          } else if (e.key === "Tab") {
            e.preventDefault();
            (document.activeElement === confirm ? discard : confirm).focus();
          }
        },
        { ...listen, capture: true },
      );
      scrim.addEventListener(
        "pointerdown",
        (e) => {
          if (e.target === scrim) answer("stay");
        },
        listen,
      );
      discard.addEventListener("click", () => answer("discard"), listen);
      confirm.addEventListener("click", () => answer("confirm"), listen);
      signal.addEventListener("abort", () => answer("stay"), listen);
    });

    host.appendChild(scrim);
    confirm.focus({ preventScroll: true });
    return current;
  }

  return {
    ask,
    get open() {
      return current !== null;
    },
  };
}
