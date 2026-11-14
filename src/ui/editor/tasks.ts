import { createEta, formatDownload, formatProgress, formatTimeLeft } from "../../utils/eta";
import type { ConfirmChoice, ConfirmQuestion } from "./confirm";
import { resolveToolDef } from "./tool-registry";

export type ToolTaskState = "running" | "done" | "failed" | "stopped";

/**
 * How a task ends for everything else on the photo: by changing the photo,
 * or by opening another image. Either way, nothing else on it can run
 * alongside, since it would be lost when that happens.
 */
export type ToolTaskChange = "photo" | "view";

export interface ToolTaskOptions {
  /** The tool it runs in: the editor's header goes back to it. */
  tool: string;
  /** What the button said: "Find faces". Asking whether to stop another task names it. */
  action: string;
  /** What's happening while it runs: "Looking for faces…". */
  working: string;
  /** It ends by changing the photo, or by opening another image. */
  changes?: ToolTaskChange;
  /** A model download: not tied to the photo, and never in another task's way. */
  download?: boolean;
}

/** Work a tool does in the background, said in the editor's header until it's over. */
export interface ToolTask {
  readonly tool: string;
  readonly state: ToolTaskState;
  /** "Erasing…" while it runs; how it ended after. */
  readonly label: string;
  /** "40%", "2 min left": beside the label, or empty. */
  readonly detail: string;
  /** How much is done, 0 to 1, or null when that isn't known. */
  readonly progress: number | null;
  /** Aborted when someone stops it: stop working, and don't commit a result. */
  readonly signal: AbortSignal;
  /** How it's going: a new label, with a detail and the share done. */
  working(label: string, options?: { detail?: string; progress?: number }): void;
  /** A download's bytes so far (total 0 when unknown): said as bytes and the time left. */
  bytes(loaded: number, total: number): void;
  /** It finished: "Erased". The header says so for a few seconds. */
  done(label: string, detail?: string): void;
  /** It didn't work: why, in a few words. */
  failed(label: string): void;
  /** Stop it, as the header's Stop button does. */
  stop(): void;
  /** Hear of every change to it. Returns a function that stops listening. */
  watch(listener: (task: ToolTask) => void): () => void;
}

/** `ctx.tasks`: start a tool's background work, and find it again after the pane remounts. */
export interface ToolTasks {
  /**
   * Start a task on this photo. If it can't run alongside one already
   * running, because either changes the photo, the editor asks whether to
   * stop that one; it resolves null when the answer was no, or when this
   * tool already has a task running.
   */
  start(options: ToolTaskOptions): Promise<ToolTask | null>;
  /** The tool's task running on this photo, if any: a pane mounted mid-run shows it. */
  running(tool: string): ToolTask | null;
}

/** A task as the registry keeps it: whose photo it's on, and what the tool is called. */
export interface TaskRecord extends ToolTask {
  readonly id: number;
  /** The photo it runs on; null for a download. */
  readonly entry: object | null;
  readonly options: ToolTaskOptions;
  readonly toolLabel: string;
  /** Take a finished task off the header now. */
  dismiss(): void;
}

export type TaskAsk = (question: ConfirmQuestion) => Promise<ConfirmChoice>;

/** Every task of one Retouch instance. It outlives the editor, which remounts when a photo changes. */
export interface TaskRegistry {
  /** Running tasks, and finished ones while the header still says so, oldest first. */
  list(): readonly TaskRecord[];
  /** Hear of any task starting, moving on or ending. Returns a function that stops listening. */
  watch(listener: () => void): () => void;
  /**
   * The open editor's question, which clashes ask with. Returns a function
   * that takes it back, unless another editor has set its own since.
   */
  setAsk(ask: TaskAsk): () => void;
  /** The tasks API for tools working on `entry`. */
  tasksFor(entry: object): ToolTasks;
  /** Tasks on `entry` that change the photo or open another image when they're done. */
  landing(entry: object): readonly TaskRecord[];
  /**
   * Before leaving the photo (`action`: "close"): if a task on `entry` would
   * land after that, ask whether to stop it. Resolves false to stay.
   */
  settle(entry: object, action: string): Promise<boolean>;
}

/** How long the header keeps saying a task finished, or why it didn't. */
const DONE_MS = 4000;
const FAILED_MS = 8000;
/** A download's time left changes once a second at most, so it can be read. */
const TIME_LEFT_MS = 1000;

const ellipsis = /(…|\.\.\.)$/;
const lower = (text: string): string => text.charAt(0).toLowerCase() + text.slice(1);

function names(tasks: readonly TaskRecord[]): { title: string; them: string } {
  const labels = [...new Set(tasks.map((t) => t.toolLabel))];
  const list =
    labels.length > 1 ? `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}` : labels[0];
  return {
    title: `${list} ${labels.length > 1 ? "are" : "is"} still running`,
    them: labels.length > 1 ? "them" : labels[0],
  };
}

/** "Erasing changes the photo when it's done": what the one that changes it does. */
function change(options: ToolTaskOptions): string {
  const doing = options.working.replace(ellipsis, "");
  const what = options.changes === "view" ? "opens the new image" : "changes the photo";
  return `${doing} ${what} when it's done`;
}

export function createTaskRegistry(now: () => number = () => performance.now()): TaskRegistry {
  let tasks: TaskRecord[] = [];
  let nextId = 0;
  let ask: TaskAsk | null = null;
  const listeners = new Set<() => void>();

  function emit(): void {
    for (const listener of [...listeners]) listener();
  }

  function remove(task: TaskRecord): void {
    const before = tasks.length;
    tasks = tasks.filter((t) => t !== task);
    if (tasks.length !== before) emit();
  }

  function create(entry: object | null, options: ToolTaskOptions): TaskRecord {
    const abort = new AbortController();
    const watchers = new Set<(task: ToolTask) => void>();
    const eta = createEta(now);
    let timeLeft = "";
    let timeLeftAt = Number.NEGATIVE_INFINITY;
    let linger: ReturnType<typeof setTimeout> | undefined;

    const changed = (): void => {
      for (const watcher of [...watchers]) watcher(task);
      emit();
    };
    const finish = (state: ToolTaskState, label: string, detail: string, ms: number): void => {
      if (task.state !== "running") return;
      task.state = state;
      task.label = label;
      task.detail = detail;
      task.progress = null;
      changed();
      if (ms > 0) linger = setTimeout(() => remove(task), ms);
      else remove(task);
    };

    const task: TaskRecord & {
      state: ToolTaskState;
      label: string;
      detail: string;
      progress: number | null;
    } = {
      id: ++nextId,
      entry,
      options,
      tool: options.tool,
      toolLabel: resolveToolDef(options.tool).label,
      state: "running",
      label: options.working,
      detail: "",
      progress: null,
      signal: abort.signal,
      working(label, { detail = "", progress } = {}) {
        if (task.state !== "running") return;
        task.label = label;
        task.detail = detail;
        task.progress = progress ?? null;
        changed();
      },
      bytes(loaded, total) {
        if (task.state !== "running") return;
        const left = eta.push(loaded, total);
        const at = now();
        if (left !== null && at - timeLeftAt >= TIME_LEFT_MS) {
          timeLeft = formatTimeLeft(left);
          timeLeftAt = at;
        }
        task.detail =
          total > 0 ? timeLeft || formatProgress(loaded, total) : formatDownload(loaded);
        task.progress = total > 0 ? Math.min(1, loaded / total) : null;
        changed();
      },
      done(label, detail = "") {
        finish("done", label, detail, DONE_MS);
      },
      failed(label) {
        finish("failed", label, "", FAILED_MS);
      },
      stop() {
        if (task.state !== "running") return;
        abort.abort();
        finish("stopped", task.label, "", 0);
      },
      watch(listener) {
        watchers.add(listener);
        return () => watchers.delete(listener);
      },
      dismiss() {
        if (task.state === "running") return;
        clearTimeout(linger);
        remove(task);
      },
    };
    tasks = [...tasks, task];
    emit();
    return task;
  }

  const runningOn = (entry: object): TaskRecord[] =>
    tasks.filter((t) => t.state === "running" && t.entry === entry && !t.options.download);
  const landing = (entry: object): TaskRecord[] =>
    runningOn(entry).filter((t) => t.options.changes);

  /** Ask the open editor; with none open, nothing is stopped. */
  const question = (q: ConfirmQuestion): Promise<ConfirmChoice> =>
    ask ? ask(q) : Promise.resolve("stay");

  return {
    list: () => tasks,
    watch(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setAsk(next) {
      ask = next;
      return () => {
        if (ask === next) ask = null;
      };
    },
    tasksFor(entry) {
      const running = (tool: string): TaskRecord | null =>
        runningOn(entry).find((t) => t.tool === tool) ?? null;
      return {
        running,
        async start(options) {
          if (options.download) return create(null, options);
          if (running(options.tool)) return null;
          const clashing = runningOn(entry).filter((t) => t.options.changes || options.changes);
          if (clashing.length > 0) {
            const { title, them } = names(clashing);
            const changer = clashing.find((t) => t.options.changes)?.options ?? options;
            const answer = await question({
              title,
              detail: `${change(changer)}, so they can't run at the same time.`,
              confirmLabel: `Stop ${them} and ${lower(options.action)}`,
              discardLabel: `Let ${them} finish`,
            });
            if (answer !== "confirm") return null;
            for (const task of clashing) task.stop();
            // A second click may have started it while the question was open.
            if (running(options.tool)) return null;
          }
          return create(entry, options);
        },
      };
    },
    landing,
    async settle(entry, action) {
      const ending = landing(entry);
      if (ending.length === 0) return true;
      const { title, them } = names(ending);
      const it = ending.length > 1 ? "they" : "it";
      const answer = await question({
        title,
        detail: `${change(ending[0].options)}, so ${it} can't carry on once you ${lower(action)}.`,
        confirmLabel: `Stop ${them} and ${lower(action)}`,
        discardLabel: `Let ${them} finish`,
      });
      if (answer !== "confirm") return false;
      for (const task of ending) task.stop();
      return true;
    },
  };
}
