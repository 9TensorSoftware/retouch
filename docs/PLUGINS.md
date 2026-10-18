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
| `group` | `ToolGroup` | `"frame"`, `"tone"`, `"looks"`, `"plugins"` (the default) or `"ai"`. Groups sit on the rail in that order. |
| `kinds` | `("image" \| "video")[]` | The media the tool applies to. Both by default. |
| `shortcut` | `string` | One letter. A letter a built-in tool or the editor already uses is ignored (`I` opens the AI menu). |
| `description` | `string` | For AI tools, one line on what it does, shown in the AI tools menu and the expanded rail. |
| `badge` | `string` | A short tag beside it in the AI menu, such as a download size. |
| `mount` | `(ctx) => ToolPaneHandle` | Builds the pane. |

## The pane's lifecycle

`mount(ctx)` runs each time the editor opens, for every tool on the rail, and returns a handle:

| Member | When it's called |
|---|---|
| `root` | The pane's element, shown while the tool is active. |
| `onActivate()` | The tool was picked. Refresh anything that depends on the photo's current state, such as preview tiles. |
| `onDeactivate()` | Another tool was picked. Hide overlays you put on the stage. |
| `sync()` | The edits changed outside your controls: undo, redo, a reset, an Ask AI edit, or any tool's `ctx.render()`. Move your controls to match, without firing their callbacks (`slider.set()`, `choice.set()`, `tiles.set()`). |
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
| `ctx.ui` | Control builders; see below. |
| `ctx.preview(edits?)` | A small picture of the photo with `edits` in place of the current ones, as an image URL. It shows adjustments, filter, curves, color mix and stylize; each one you pass replaces the photo's own. |
| `ctx.reveal(result)` | Wipes a new version of the photo in over the stage; see [AI tools](#ai-tools). |

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

### `note(text)`

A line of status or hint text. `set(text)` updates it, and screen readers announce the change.

### `card(options)` and `steps(options)`

For tools that download or run something; see the next section.

## AI tools

Tools in the `"ai"` group sit in their own lit section of the rail. With two or more, they also
gather behind the **All AI tools** button, whose menu lists each with its `description` and
`badge` and lets people pin the ones they use to the rail. The `rail` option sets which are
pinned to begin with:

```ts
new Retouch({ target: "#editor", rail: { pinned: ["cutout", "erase"], expanded: false } });
```

A tool that downloads a model should say so before anything is fetched. The kit has the parts:

```ts
mount(ctx) {
  const { root, body, setFact } = ctx.ui.card({
    description: "Sharpens faces. Apply replaces this photo's pixels.",
    facts: [
      ["Model", "FaceFix v2"],
      ["Download", "48 MB, once, then saved"],
      ["Runs on", "This device"],
    ],
  });
  const steps = ctx.ui.steps({
    label: "Progress",
    steps: [{ label: "Download the model", detail: "48 MB" }, { label: "Restore the faces" }],
  });
  const run = ctx.ui.button({ label: "Restore · 48 MB", variant: "ai", onClick: () => void go() });
  const note = ctx.ui.note("");
  body.append(run.root, steps.root, note.root);

  async function go() {
    run.setDisabled(true);
    steps.set(0, "active", { progress: 0 });
    const model = await download((loaded, total) =>
      steps.set(0, "active", { progress: loaded / total }),
    );
    steps.set(0, "done");
    setFact("Download", "Saved on this device");
    run.setLabel("Restore");
    steps.set(1, "active");
    const result = await restore(model, ctx.entry);
    steps.set(1, "done");
    const takeBack = await ctx.reveal(result); // wipes the result in over the photo
    if (!(await commit(result))) takeBack(); // not committed: the photo goes back as it was
  }

  return { root };
},
```

`steps.set(index, state, { detail, progress })` moves a step through `"waiting"`, `"active"`
(with a bar while `progress` is set), `"done"` and `"failed"`; `reset()` starts over.
`ctx.reveal(result)` takes a canvas or image, lays it over the stage with the photo's current
look, and wipes it in. It resolves when the wipe ends, with a function that takes the result
back off; it's instant under reduced motion, and skipped while a crop or warp means the result
wouldn't line up. `@9tensor/retouch-ml` is built this way, and its
[plugin.ts](../packages/ml/src/plugin.ts) is a full example.

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
`UiTiles`, `UiTilesOptions`, `UiTileOption`, `UiNote`, `UiCard`, `UiCardOptions`, `UiSteps`,
`UiStepsOptions`, `UiStep`, `UiStepState`, `RailOptions` and `OpenEditorOptions` are exported
from `@9tensor/retouch`.
