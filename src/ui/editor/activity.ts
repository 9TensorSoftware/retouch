import { h } from "../h";
import { ICON_ALERT, ICON_CHECK, ICON_CLOSE } from "../icons";
import type { TaskRecord, TaskRegistry } from "./tasks";

export interface ActivityOptions {
  tasks: TaskRegistry;
  /** Open the tool a task runs in. */
  onGo(tool: string): void;
  signal: AbortSignal;
}

export interface ActivityHandle {
  root: HTMLElement;
}

const ellipsis = /(…|\.\.\.)$/;

/** The newest running task; with none running, the one that finished last. */
function pick(tasks: readonly TaskRecord[]): TaskRecord | null {
  const running = tasks.filter((t) => t.state === "running");
  return running.at(-1) ?? tasks.filter((t) => t.state !== "stopped").at(-1) ?? null;
}

/**
 * The header's word on background work: what's running and how far along,
 * with Stop, for whichever tool is open; then how it ended, for a few
 * seconds. A click goes back to the tool it runs in.
 */
export function createActivity(options: ActivityOptions): ActivityHandle {
  const { tasks, onGo, signal } = options;
  const listen = { signal };

  const mark = h("span", { class: "rt-activity__mark", "aria-hidden": "true" });
  const label = h("span", { class: "rt-activity__label" });
  const detail = h("span", { class: "rt-activity__detail" });
  const more = h("span", { class: "rt-activity__more" });
  const main = h(
    "button",
    { type: "button", class: "rt-activity__main" },
    mark,
    label,
    detail,
    more,
  );
  const stop = h("button", { type: "button", class: "rt-activity__stop" });
  stop.innerHTML = ICON_CLOSE;
  const announcer = h("span", { class: "rt-visually-hidden", "aria-live": "polite" });
  const root = h("div", { class: "rt-activity" }, main, stop, announcer);
  root.hidden = true;

  let shown: TaskRecord | null = null;
  /** What was last announced, so progress alone stays quiet. */
  let said = "";

  main.addEventListener(
    "click",
    () => {
      if (!shown) return;
      const task = shown;
      onGo(task.tool);
      task.dismiss();
    },
    listen,
  );
  stop.addEventListener("click", () => shown?.stop(), listen);

  function paint(): void {
    const all = tasks.list();
    const task = pick(all);
    shown = task;
    root.hidden = task === null;
    if (!task) return;
    const running = task.state === "running";
    root.dataset.state = task.state;
    label.textContent = task.label;
    detail.textContent = task.detail;
    detail.hidden = task.detail === "";
    const others = running ? all.filter((t) => t.state === "running").length - 1 : 0;
    more.textContent = others > 0 ? `+${others}` : "";
    more.hidden = others === 0;
    more.title = others > 0 ? `${others} more running` : "";
    mark.dataset.progress = task.progress === null ? "none" : "some";
    mark.style.setProperty("--rt-p", String(task.progress ?? 0));
    mark.innerHTML = task.state === "done" ? ICON_CHECK : task.state === "failed" ? ICON_ALERT : "";
    main.title = `Go to ${task.toolLabel}`;
    stop.hidden = !running;
    const doing = lower(task.options.working.replace(ellipsis, ""));
    stop.title = `Stop ${doing}`;
    stop.setAttribute("aria-label", `Stop ${doing}`);
    const words = running ? task.options.working : task.label;
    if (words !== said) {
      said = words;
      announcer.textContent = words;
    }
  }

  const unwatch = tasks.watch(paint);
  signal.addEventListener("abort", unwatch);
  paint();
  return { root };
}

function lower(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}
