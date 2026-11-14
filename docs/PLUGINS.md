# Writing a tool

A tool is a button on the editor's rail and a pane in its inspector. The built-in tools are
registered the same way, and so are the ones in `@9tensor/retouch-ml`. A tool changes the shared,
non-destructive edit model, so its changes preview, undo and export like any other, and it builds
its pane from `ctx.ui`, so it looks like the rest of the editor without any CSS of its own.

## A first tool

```ts
import { Retouch } from "@9tensor/retouch";

Retouch.registerTool({
  id: "golden",
  label: "Golden hour",
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">…</svg>',
  group: "looks",
  shortcut: "g",
  mount(ctx) {
    const warmth = ctx.ui.slider({
      label: "Warmth",
      min: -100,
      max: 100,
      value: ctx.edits.adjustments.temperature,
      track: "linear-gradient(90deg, #3f86ff, #ffffff, #ffa53a)",
      onInput: (value) => {
        ctx.edits.adjustments.temperature = value;
        ctx.render();
      },
      onChange: () => ctx.record(),
    });
    return {
      root: ctx.ui.section("Light", warmth.root),
      sync: () => warmth.set(ctx.edits.adjustments.temperature),
    };
  },
});
```

Register at startup: the editor reads the registry each time it opens. Every registered tool is
on the rail unless the `tools` option picks a subset:

```ts
new Retouch({ target: "#editor", tools: ["crop", "adjust", "golden"] });
```

`retouch.openEditor(id, { tool: "golden" })` opens the editor on it.

## Registering

`Retouch.registerTool(plugin)` takes:

| Field | Type | What it does |
|---|---|---|
| `id` | `string` | Unique. Also what `tools` and `openEditor`'s `tool` take. |
| `label` | `string` | The name in tooltips, the inspector title and the expanded rail. |
| `icon` | `string` | Inline SVG, drawn in `currentColor`. |
| `group` | `ToolGroup` | `"frame"`, `"tone"`, `"looks"`, `"plugins"` (the default), `"ai"` or `"about"` (where Info sits). Groups sit on the rail in that order. |
| `kinds` | `("image" \| "video")[]` | The media the tool applies to. Both by default. |
| `shortcut` | `string` | One letter. A letter a built-in tool or the editor already uses is ignored (`I` opens the AI menu). |
| `description` | `string` | For AI tools, one line on what it does, shown in the AI tools menu and the expanded rail. |
| `badge` | `string` | A short tag beside it in the AI menu, such as a download size. |
| `ready` | `() => boolean` | For a tool that downloads a model: whether it's on this device. Asked each time the AI menu opens; while it's true, the menu says Ready instead of the badge. |
| `mount` | `(ctx) => ToolPaneHandle` | Builds the pane. |

## The pane's lifecycle

`mount(ctx)` runs each time the editor opens, for every tool on the rail, and returns a handle:

| Member | When it's called |
|---|---|
| `root` | The pane's element, shown while the tool is active. |
| `onActivate()` | The tool was picked. Refresh anything that depends on the photo's current state, such as preview tiles. |
| `onDeactivate()` | Another tool was picked. Hide overlays you put on the stage. |
| `sync()` | The edits changed outside your controls: undo, redo, a reset, an Ask AI edit, or any tool's `ctx.render()`. Move your controls to match, without firing their callbacks (`slider.set()`, `choice.set()`, `tiles.set()`, `list.set()`). |
| `destroy()` | The editor closed. Remove listeners and anything you added outside `root`. |

Listeners that `ctx.ui` controls attach are removed with the editor, so `destroy` is only for
what you add yourself.

## The context

| Member | |
|---|---|
| `ctx.kind` | `"image"` or `"video"`. |
| `ctx.entry` | The entry being edited: its source media, file and edits. |
| `ctx.edits` | The live edit state (`ImageEdits`, or `VideoEdits` for a video). Change it in place. |
| `ctx.render()` | Draws the current edits on the stage and syncs every tool's controls. |
| `ctx.record()` | Adds an undo step. Call it once per user gesture, after the change. |
| `ctx.canvasArea` | The element around the canvas, for overlays of your own. |
| `ctx.objects(options)` | A layer of things found in the media, over it and apart from its pixels; see [Object layers](#object-layers). |
| `ctx.ui` | Control builders; see below. |
| `ctx.preview(edits?)` | A small picture of the photo with `edits` in place of the current ones, as an image URL. It shows adjustments, filter, curves, color mix and stylize; each one you pass replaces the photo's own. |
| `ctx.reveal(result)` | Wipes a new version of the photo in over the stage; see [AI tools](#ai-tools). |
| `ctx.tasks` | Work that runs in the background, said in the editor's header whichever tool is open; see [Background work](#background-work). |

The usual pattern is: change `ctx.edits`, call `ctx.render()` while the gesture runs, and
`ctx.record()` when it ends. A slider's `onInput` and `onChange` map onto exactly that.

## Controls

Everything `ctx.ui` returns has a `root` element to place in your pane.

### `row(...children)` and `section(title, ...children)`

A row lays controls in a line; a section is a titled group whose controls stack. Children are
nodes or strings.

### `slider(options)`

| Option | |
|---|---|
| `label` | Shown above the track. |
| `ariaLabel` | The accessible name, when the label alone is ambiguous ("Aperture strength"). |
| `min`, `max`, `step` | The range; `step` defaults to 1. |
| `value` | The starting value. |
| `neutral` | The resting value. The fill grows out from it, a dot marks the slider while it's elsewhere, and a double-click on the label or track returns to it. Defaults to 0 when the range spans zero, otherwise `min`. |
| `fillFrom` | Where the fill starts, when that isn't `neutral`. |
| `track` | A CSS image for the track that shows what the slider does, such as a cool-to-warm gradient. Replaces the fill. |
| `format(value)` | The readout. Defaults to the number, signed when the range spans zero. |
| `parse(text)` | Reads a typed value back, the inverse of `format`. Defaults to the first number in the text. |
| `onInput(value)` | Fires continuously during a change. |
| `onChange(value)` | Fires once per gesture (release, key press, reset): call `ctx.record()` here. |

The readout is a field people can type into; `↑` and `↓` step the value, with Shift for ten.
The handle has `value` and `set(value)`, which moves the slider without firing callbacks.

### `button(options)`

`label`, `onClick`, and optionally `variant` (`"default"`, `"primary"` for the pane's main
action, `"ai"` for one that runs a model), `active` (a pressed toggle), `disabled` and `title`.
The handle has `setLabel()`, `setActive()` and `setDisabled()`.

### `choice(options)`

One of several options, shown as pills: `label` (names the group for assistive tech),
`options` (`{ value, label }[]`), `value`, `onChange`. The handle has `value` and `set()`.

### `tiles(options)`

Preview tiles, like the built-in Filters: `label`, `options` (`{ value, label, preview }[]`,
where `preview` is an image URL, usually from `ctx.preview()`), `value` (or `null` for none),
`onChange`, and `columns` (3 by default). The handle has `value`, `set()` and
`setPreview(value, src)`; redraw previews in `onActivate`, since the photo may have changed
since the pane was built.

```ts
const looks = ctx.ui.tiles({
  label: "Look",
  options: LOOKS.map((look) => ({
    value: look.name,
    label: look.name,
    preview: ctx.preview({
      filter: look.filter,
      adjustments: { ...ctx.edits.adjustments, ...look.adjustments },
    }),
  })),
  value: null,
  onChange: (name) => apply(name),
});
```

### `list(options)`

Rows to pick from, such as the tracks Track follows through a video: `label`, `items`
(`{ value, label, detail, color, span }[]`, where `detail` is a note on the right, `color` a
swatch and `span` a `[start, end]` from 0 to 1 drawn as a bar on a timeline), `value` (or
`null`), `onChange` and `onHover`. A second click on the picked row lets go, so `onChange` gets
`null`. The handle has `value`, `set()`, `setItems()`, `setCurrent(values)` to light the rows
that are current without picking them, and `setTime(t)` to draw a playhead across the spans
(`null` hides it), and `setHighlight(value)` to light a row as if pointed at, scrolling the list to
it. It scrolls past a dozen or so rows.

### `note(text)`

A line of status or hint text. `set(text)` updates it, and screen readers announce the change.

### `output({ label, text })`

A block of read-only text your tool produced, such as the text Read text finds in a photo:
selectable, scrolling past a few lines, its line breaks kept, hidden while it's empty. `label`
names it for screen readers; `set(text)` replaces the text.

### `card(options)`, `model(options)`, `status()` and `steps(options)`

For tools that download or run something; see the next section.

## Object layers

`ctx.objects()` is what Detect, Track and Read text draw on, for any tool that finds things in a
photo or video. It's an SVG layer of shapes over the media, never part of its pixels, and rows
that list the same things. Pointing at a shape or a row brings it forward on both sides and dims
the rest. Clicking picks it; clicking it again, clicking the bare photo or pressing Esc lets go.
Hovering outranks the pick, which comes back when the pointer leaves. A drag across a shape on a
zoomed photo still pans.

```ts
mount(ctx) {
  const objects = ctx.objects({
    label: "Faces",
    onSelect: (id, from) => { /* from is "layer" or "list"; id is null on letting go */ },
  });
  objects.show(found.map((f, i) => ({
    id: String(i),
    quad: [[f.x, f.y], [f.x + f.w, f.y], [f.x + f.w, f.y + f.h], [f.x, f.y + f.h]],
    color: "#5cc8ff",
    tag: "face",
  })));
  objects.setItems(found.map((f, i) => ({ value: String(i), label: "face", color: "#5cc8ff" })));
  return {
    root: ctx.ui.section("Found", objects.list),
    onActivate: () => objects.setVisible(true),
    onDeactivate: () => objects.setVisible(false),
    destroy: () => objects.destroy(),
  };
}
```

An object has an `id`, its `quad` (corners from 0 to 1 on the source frame, clockwise from
top-left, rotated if need be), a `color`, and optionally a `tag` to flag it with and a `trail` of
points it has passed. Smaller objects sit on top, so one inside another can still be reached.

The layer starts off: call `setVisible(true)` when your tool activates. `show()` replaces what's
on it, and can run per frame: objects keep their shapes by `id`, and `{ animate: true }` staggers
new ones in. `selected` reads the pick and `select(id)` sets it without firing `onSelect`.
`setFrame(rect)` says which part of the source frame is on screen, usually `ctx.edits.crop`, so
the shapes line up through a crop; `null` hides the layer, for when the frame is turned or warped.
`list` is the rows' element, to place in your pane or leave out, and `setItems`, `setCurrent` and
`setTime` work as they do on [`list()`](#listoptions).

## AI tools

Tools in the `"ai"` group sit in their own lit section of the rail. With two or more, they also
gather behind the **All AI tools** button, whose menu lists each with its `description` and
`badge` and lets people pin the ones they use to the rail. The `rail` option sets which are
pinned to begin with:

```ts
new Retouch({ target: "#editor", rail: { pinned: ["cutout", "erase"], expanded: false } });
```

A tool that downloads a model should say so before anything is fetched, and every AI tool in
the editor says it the same way. People see whether the model is here, how its download is going
and how long it has left, and what the tool does; what the model is, and what it runs on, waits
behind an info button. The kit has the parts:

```ts
mount(ctx) {
  const card = ctx.ui.card({});
  const model = ctx.ui.model({
    bytes: 48e6,
    about: {
      text: "It runs on this device, so your photo isn't uploaded.",
      facts: [["Model", "FaceFix v2"], ["Size", "48 MB"]],
    },
    onDownload: () => void download(),
  });
  const run = ctx.ui.button({ label: "Restore faces", variant: "ai", onClick: () => void go() });
  const status = ctx.ui.status();
  card.body.append(model.root, run.root, status.root);

  model.set(saved() ? "ready" : "missing");
  run.setDisabled(model.state !== "ready");

  async function download() {
    try {
      await fetchWeights((loaded, total) => model.progress(loaded, total));
      model.set("ready");
      run.setDisabled(false);
    } catch {
      model.set("failed");
    }
  }

  async function go() {
    run.setDisabled(true);
    status.working("Restoring the faces…");
    try {
      const result = await restore(ctx.entry, (done) => status.working("Restoring the faces…", { progress: done }));
      const takeBack = await ctx.reveal(result); // wipes the result in over the photo
      if (await commit(result)) status.done("Faces restored");
      else takeBack(); // not committed: the photo goes back as it was
    } catch (error) {
      status.failed(`Restore failed: ${error.message}`);
    } finally {
      run.setDisabled(false);
    }
  }

  return { root: card.root };
},
```

`ui.model()` stays out of sight until its first `set()` or `progress()`, so a quick check of
whether the model is saved doesn't flash a Download button. Then:

| State | What it shows |
|---|---|
| `"missing"` | A Download button with the size (`bytes`; `null` leaves it off). |
| `"downloading"` | `progress(loaded, total)` puts it here: the same button fills up, with how much is in ("12 of 27 MB") and, after a second, the time left at the recent rate. A `total` of 0 falls back to `bytes`. |
| `"ready"` | A green dot and Ready. |
| `"failed"` | Try again, which calls `onDownload` once more. |

`name` labels a second download in one pane ("Download Erase"). `setFact(label, value)` changes a
row of the info panel. `ui.status()` is a run on one line: `working(label, { detail, progress })`
(a bar while `progress` is set), `done(label)` with a check, `failed(label)`, and `clear()`; each
change is announced to screen readers. Put what to do next (follow-up buttons) right after it.

`ui.steps()` still lists a run's steps, each `"waiting"`, `"active"`, `"done"` or `"failed"`,
for a tool whose stages are worth naming. `ctx.reveal(result)` takes a canvas or image, lays it
over the stage with the photo's current look, and wipes it in. It resolves when the wipe ends,
with a function that takes the result back off; it's instant under reduced motion, and skipped
while a crop or warp means the result wouldn't line up. `@9tensor/retouch-ml` is built this
way, and its [plugin.ts](../packages/ml/src/plugin.ts) is a full example.

### Background work

People switch tools while a run is going. Start the run as a task and the editor keeps it in
view: the header, beside Cancel, shows what's running and how far along, with Stop, and then how
it ended for a few seconds; a click on it opens the tool again.

```ts
async function go() {
  const task = await ctx.tasks.start({
    tool: "facefix", // your tool's id: the header goes back to it
    action: "Restore faces", // what the button said
    working: "Restoring the faces…",
    changes: "photo", // it ends by replacing the photo's pixels
  });
  if (!task) return; // they kept another run going instead
  try {
    const result = await restore(ctx.entry, {
      signal: task.signal,
      onProgress: (done) => task.working("Restoring the faces…", { progress: done }),
    });
    if (task.signal.aborted) return; // stopped: leave the photo as it is
    await commit(result);
    task.done("Faces restored");
  } catch (error) {
    if (!task.signal.aborted) task.failed(`Restore failed: ${error.message}`);
  }
}
```

A task that `changes` the photo (`"photo"`), or ends by opening another image (`"view"`), can't
share it: whatever else runs on the photo would be lost when it lands. So starting one next to
another asks first, naming both: "Stop Erase and find faces", or "Let Erase finish", in which case
`start()` resolves null. Done and Cancel ask the same about a task that would land after the
editor closes. Tasks that leave the photo alone run side by side. `start()` also resolves null
while the same tool already has a task running.

| Task member | |
|---|---|
| `working(label, { detail, progress })` | How it's going; `progress` from 0 to 1 fills the header's ring. |
| `bytes(loaded, total)` | A download's progress, said as bytes and then the time left. |
| `done(label, detail?)` / `failed(label)` | How it ended. |
| `signal` | Aborted when someone presses Stop: stop working, and commit nothing. |
| `stop()` | Stop it from your own control, as Track's Stop does. |
| `watch(listener)` | Hear of each change, to show it in the pane's `ui.status()` too. |
| `state`, `label`, `detail`, `progress` | Where it stands now. |

Pass `download: true` for a model download: it shows in the header like any task, never asks,
and isn't tied to the photo. Tasks outlive the pane. A task that replaces the photo remounts the
editor, and a pane mounted mid-run finds it with `ctx.tasks.running(id)` to show it to the end.

## Styling

Panes built from `ctx.ui` follow the editor's theme and design, including future changes, with
no CSS. For anything the kit doesn't cover, use the [theme tokens](THEMING.md) rather than fixed
colors, so it follows a host's branding too:

```css
.my-tool__hint {
  color: var(--rt-text-3);
  font: var(--rt-type-sm) / 1.4 var(--rt-font-ui);
}
```

Panes built by hand from the older `rt-dock__*` classes still render. A hand-built
`<input type="range">` inside a `.rt-dock__slider` element gets the filled track when you call
`refreshRangeFill(input)` (exported from `@9tensor/retouch`) after creating it, from its `input`
listener, and wherever you set its value.

## Types

`EditorToolPlugin`, `ToolContext`, `ToolPaneHandle`, `ToolGroup`, `PreviewEdits`, `ToolUi`,
`UiSlider`, `UiSliderOptions`, `UiButton`, `UiButtonOptions`, `UiChoice`, `UiChoiceOptions`,
`UiTiles`, `UiTilesOptions`, `UiTileOption`, `UiNote`, `UiCard`, `UiCardOptions`, `UiModel`,
`UiModelOptions`, `UiModelState`, `UiStatus`, `UiSteps`, `UiStepsOptions`, `UiStep`,
`UiStepState`, `ToolTasks`, `ToolTask`, `ToolTaskOptions`, `ToolTaskState`, `ToolTaskChange`,
`RailOptions` and `OpenEditorOptions` are exported from `@9tensor/retouch`.
