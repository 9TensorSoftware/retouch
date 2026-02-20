import { Retouch } from "../src/index";

const editor = new Retouch({
  target: "#editor",
  width: 800,
  height: 600,
});

Object.assign(window, { editor });

console.log("[Rétouch Demo] Editor mounted. Access via `editor` in console.");
