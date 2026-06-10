import { Retouch } from "../src/index";

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

Object.assign(window, { editor });
