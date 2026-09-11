import { installMlTools } from "../packages/ml/src/index";
import type { Adjustments, FilterPreset, ToolContext } from "../src/index";
import { Retouch } from "../src/index";

// ── Demo of the plugin API: a custom "Looks" feature group ──────────────
// One-tap moods that write through the same non-destructive edit model the
// built-in tools use, so previews, undo, and export all work unchanged.

interface Look {
  name: string;
  filter: FilterPreset;
  adjustments: Partial<Adjustments>;
}

const LOOKS: Look[] = [
  {
    name: "Golden hour",
    filter: "warm",
    adjustments: { temperature: 35, vibrance: 25, vignette: 20 },
  },
  { name: "Noir", filter: "bw", adjustments: { contrast: 130, grain: 25, vignette: 35 } },
  { name: "Punchy", filter: "vivid", adjustments: { contrast: 115, vibrance: 40, sharpen: 20 } },
  {
    name: "Faded film",
    filter: "vintage",
    adjustments: { contrast: 88, grain: 30, temperature: 10 },
  },
  { name: "Cool morning", filter: "cool", adjustments: { temperature: -25, exposure: 10 } },
];

Retouch.registerTool({
  id: "looks",
  label: "Looks",
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l2.5 5.5L20 11l-5.5 2.5L12 19l-2.5-5.5L4 11l5.5-2.5L12 3z"/></svg>',
  mount(ctx: ToolContext) {
    const root = document.createElement("div");
    root.className = "rt-dock__row";
    for (const look of LOOKS) {
      const chip = document.createElement("button");
      chip.className = "rt-dock__chip";
      chip.textContent = look.name;
      chip.addEventListener("click", () => {
        ctx.edits.filter = look.filter;
        ctx.edits.adjustments = { ...ctx.edits.adjustments, ...look.adjustments };
        ctx.render();
        ctx.record();
      });
      root.appendChild(chip);
    }
    return { root };
  },
});

const editor = new Retouch({
  target: "#editor",
  // Visitors can paste their own Anthropic key to try the AI command bar.
  ai: { allowUserKey: true },
  onDone: (blobs) => {
    console.log(`[Rétouch] Done — exported ${blobs.length} image(s)`, blobs);

    for (const blob of blobs) {
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    }
  },
});

// ML tools (on-device, lazy model download on first use)
installMlTools(editor);

Object.assign(window, { editor });
