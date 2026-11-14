import type { ViewHandle } from "../src/types";
import { createActivity } from "../src/ui/editor/activity";
import type { ConfirmQuestion } from "../src/ui/editor/confirm";
import { createEditor } from "../src/ui/editor/editor";
import { createTaskRegistry, type TaskRegistry } from "../src/ui/editor/tasks";
import { registerEditorTool } from "../src/ui/editor/tool-registry";
import { makeImageEntry, stubLayout } from "./editor-helpers";

// Tasks name their tool as the rail does.
for (const [id, label] of [
  ["erase", "Erase"],
  ["detect", "Detect"],
  ["text", "Read text"],
]) {
  registerEditorTool({
    id,
    label,
    icon: "",
    mount: () => ({ root: document.createElement("div") }),
  });
}

const photo = { image: {} };
const other = { image: {} };

/** A registry whose questions are answered with `answer`, and kept for a look. */
function answering(answer: "confirm" | "discard" | "stay"): {
  tasks: TaskRegistry;
  asked: ConfirmQuestion[];
} {
  const tasks = createTaskRegistry();
  const asked: ConfirmQuestion[] = [];
  tasks.setAsk(async (question) => {
    asked.push(question);
    return answer;
  });
  return { tasks, asked };
}

const erase = { tool: "erase", action: "Erase", working: "Erasing…", changes: "photo" } as const;
const faces = { tool: "detect", action: "Find faces", working: "Looking for faces…" };
const reading = { tool: "text", action: "Read the text", working: "Reading…" };

describe("tool tasks", () => {
  afterEach(() => vi.useRealTimers());

  it("runs one at a time per tool, and says how it ended for a while", async () => {
    vi.useFakeTimers();
    const { tasks } = answering("stay");
    const on = tasks.tasksFor(photo);
    const task = await on.start(faces);
    expect(task?.state).toBe("running");
    expect(on.running("detect")).toBe(task);
    // A second click on the same tool starts nothing.
    expect(await on.start(faces)).toBeNull();

    task?.working("Looking for faces…", { detail: "40%", progress: 0.4 });
    expect(tasks.list()[0]).toMatchObject({ detail: "40%", progress: 0.4 });
    task?.done("1 face");
    expect(on.running("detect")).toBeNull();
    expect(tasks.list()[0]).toMatchObject({ state: "done", label: "1 face" });
    vi.advanceTimersByTime(4000);
    expect(tasks.list()).toEqual([]);
  });

  it("lets tasks that leave the photo alone run side by side, without asking", async () => {
    const { tasks, asked } = answering("stay");
    const on = tasks.tasksFor(photo);
    expect(await on.start(faces)).not.toBeNull();
    expect(await on.start(reading)).not.toBeNull();
    // And anything on another photo is no clash at all.
    expect(await tasks.tasksFor(other).start(erase)).not.toBeNull();
    expect(asked).toEqual([]);
  });

  it("asks before starting next to a task that changes the photo, naming both", async () => {
    const { tasks, asked } = answering("discard");
    const on = tasks.tasksFor(photo);
    const erasing = await on.start(erase);
    expect(await on.start(faces)).toBeNull();
    expect(asked).toEqual([
      {
        title: "Erase is still running",
        detail: "Erasing changes the photo when it's done, so they can't run at the same time.",
        confirmLabel: "Stop Erase and find faces",
        discardLabel: "Let Erase finish",
      },
    ]);
    // Let it finish: it carries on.
    expect(erasing?.state).toBe("running");
    expect(erasing?.signal.aborted).toBe(false);
  });

  it("stops the one running when that's the answer, then starts", async () => {
    const { tasks, asked } = answering("confirm");
    const on = tasks.tasksFor(photo);
    const finding = await on.start(faces);
    const reader = await on.start(reading);
    const erasing = await on.start(erase);
    expect(asked[0]).toMatchObject({
      title: "Detect and Read text are still running",
      detail: "Erasing changes the photo when it's done, so they can't run at the same time.",
      confirmLabel: "Stop them and erase",
      discardLabel: "Let them finish",
    });
    expect(finding?.signal.aborted).toBe(true);
    expect(reader?.state).toBe("stopped");
    expect(erasing?.state).toBe("running");
    // Stopped ones leave the header at once.
    expect(tasks.list()).toEqual([erasing]);
  });

  it("starts nothing that clashes while no editor is there to ask", async () => {
    const tasks = createTaskRegistry();
    const on = tasks.tasksFor(photo);
    await on.start(erase);
    expect(await on.start(faces)).toBeNull();
  });

  it("never holds a download up, and says it in bytes and then the time left", async () => {
    let now = 0;
    const tasks = createTaskRegistry(() => now);
    const on = tasks.tasksFor(photo);
    await on.start(erase);
    const download = await on.start({
      tool: "detect",
      action: "Download Detect",
      working: "Downloading Detect",
      download: true,
    });
    expect(download).not.toBeNull();
    download?.bytes(0, 4_900_000);
    expect(download?.detail).toBe("0 of 4.9 MB");
    now = 2000;
    download?.bytes(980_000, 4_900_000);
    expect(download).toMatchObject({ detail: "8 s left", progress: 0.2 });
    // A download isn't the photo's: it's not its tool's run either.
    expect(on.running("detect")).toBeNull();
  });

  it("before closing, asks to stop what would land on the photo afterwards", async () => {
    const { tasks, asked } = answering("confirm");
    expect(tasks.landing(photo)).toEqual([]);
    expect(await tasks.settle(photo, "close")).toBe(true);
    expect(asked).toEqual([]);

    const erasing = await tasks.tasksFor(photo).start(erase);
    expect(await tasks.settle(photo, "close")).toBe(true);
    expect(asked[0]).toMatchObject({
      detail: "Erasing changes the photo when it's done, so it can't carry on once you close.",
      confirmLabel: "Stop Erase and close",
      discardLabel: "Let Erase finish",
    });
    expect(erasing?.state).toBe("stopped");
  });

  it("hands the question back only if no other editor has taken it since", async () => {
    const tasks = createTaskRegistry();
    const first = vi.fn(async () => "stay" as const);
    const second = vi.fn(async () => "stay" as const);
    const release = tasks.setAsk(first);
    tasks.setAsk(second);
    release();
    const on = tasks.tasksFor(photo);
    await on.start(erase);
    await on.start(faces);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe("the header's word on background work", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  function header(tasks: TaskRegistry, onGo = vi.fn()) {
    const abort = new AbortController();
    const { root } = createActivity({ tasks, onGo, signal: abort.signal });
    document.body.appendChild(root);
    const text = (selector: string) => root.querySelector<HTMLElement>(selector);
    return { root, onGo, abort, text };
  }

  it("is empty with nothing running, then shows the newest task with Stop", async () => {
    const { tasks } = answering("stay");
    const { root, text } = header(tasks);
    expect(root.hidden).toBe(true);

    const on = tasks.tasksFor(photo);
    await on.start(faces);
    const task = await on.start(reading);
    task?.working("Reading…", { detail: "40%", progress: 0.4 });
    expect(root.hidden).toBe(false);
    expect(root.dataset.state).toBe("running");
    expect(text(".rt-activity__label")?.textContent).toBe("Reading…");
    expect(text(".rt-activity__detail")?.textContent).toBe("40%");
    expect(text(".rt-activity__more")?.textContent).toBe("+1");
    expect(text(".rt-activity__mark")?.style.getPropertyValue("--rt-p")).toBe("0.4");
    const stop = text(".rt-activity__stop") as HTMLButtonElement;
    expect(stop.getAttribute("aria-label")).toBe("Stop reading");

    stop.click();
    expect(task?.state).toBe("stopped");
    expect(text(".rt-activity__label")?.textContent).toBe("Looking for faces…");
    expect(text(".rt-activity__more")?.hidden).toBe(true);
  });

  it("says how it ended, and a click goes to its tool and clears it", async () => {
    const { tasks } = answering("stay");
    const { root, onGo, text } = header(tasks);
    const task = await tasks.tasksFor(photo).start(erase);
    task?.done("Erased");
    expect(root.dataset.state).toBe("done");
    expect(text(".rt-activity__label")?.textContent).toBe("Erased");
    expect(text(".rt-activity__stop")?.hidden).toBe(true);
    expect(text(".rt-activity__main")?.title).toBe("Go to Erase");

    (text(".rt-activity__main") as HTMLButtonElement).click();
    expect(onGo).toHaveBeenCalledWith("erase");
    expect(root.hidden).toBe(true);
  });

  it("stops listening once its editor is gone", async () => {
    const { tasks } = answering("stay");
    const { root, abort } = header(tasks);
    abort.abort();
    await tasks.tasksFor(photo).start(faces);
    expect(root.hidden).toBe(true);
  });
});

describe("the editor and background work", () => {
  let restoreLayout: () => void;
  let editor: ViewHandle;

  beforeEach(() => {
    restoreLayout = stubLayout(800, 600);
  });

  afterEach(() => {
    editor.destroy();
    document.body.innerHTML = "";
    restoreLayout();
  });

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const button = (text: string) =>
    [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (b) => b.textContent === text,
    ) as HTMLButtonElement;

  it("shows tasks beside Cancel, goes to their tool, and asks before Done cuts one short", async () => {
    const entry = makeImageEntry();
    const tasks = createTaskRegistry();
    const onDone = vi.fn();
    editor = createEditor({ entry, onDone, onCancel: vi.fn(), tasks });
    document.body.appendChild(editor.root);

    const task = await tasks.tasksFor(entry).start({
      tool: "curves",
      action: "Bend it",
      working: "Bending…",
      changes: "photo",
    });
    const pill = document.querySelector<HTMLElement>(".rt-editor__topbar-left .rt-activity");
    expect(pill?.hidden).toBe(false);
    expect(pill?.textContent).toContain("Bending…");
    pill?.querySelector<HTMLButtonElement>(".rt-activity__main")?.click();
    expect(document.querySelector(".rt-inspector__title")?.textContent).toBe("Curves");

    document.querySelector<HTMLButtonElement>(".rt-editor__btn-done")?.click();
    expect(document.querySelector(".rt-confirm__title")?.textContent).toBe(
      "Curves is still running",
    );
    button("Let Curves finish").click();
    await settle();
    expect(onDone).not.toHaveBeenCalled();
    expect(task?.state).toBe("running");

    document.querySelector<HTMLButtonElement>(".rt-editor__btn-done")?.click();
    button("Stop Curves and close").click();
    await settle();
    await settle();
    expect(task?.state).toBe("stopped");
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("closes at once when nothing would land after", () => {
    const entry = makeImageEntry();
    const onCancel = vi.fn();
    editor = createEditor({ entry, onDone: vi.fn(), onCancel });
    document.body.appendChild(editor.root);
    document.querySelector<HTMLButtonElement>(".rt-editor__btn-cancel")?.click();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
