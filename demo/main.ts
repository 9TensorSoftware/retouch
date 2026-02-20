import { Retouch } from "../src/index";

const editor = new Retouch({
  target: "#editor",
  onDone: (blobs) => {
    console.log("[Rétouch Demo] Done! Exported blobs:", blobs);
  },
});

Object.assign(window, { editor });

console.log("[Rétouch Demo] Editor mounted. Access via `editor` in console.");
