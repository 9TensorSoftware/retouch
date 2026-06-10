import { ACCEPTED_VIDEO_TYPES, Retouch } from "../src/index";

const editor = new Retouch({
  target: "#editor",
  acceptedVideoTypes: ACCEPTED_VIDEO_TYPES,
  onDone: (blobs) => {
    console.log(`[Rétouch] Done — exported ${blobs.length} image(s)`, blobs);

    for (const blob of blobs) {
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    }
  },
});

Object.assign(window, { editor });
