// Procedural sample photos: painted landscapes generated in the browser, so
// demos open with something to edit and never depend on a network fetch.

interface Layer {
  /** Ridge baseline, as a fraction of the image height. */
  base: number;
  /** Ridge roughness, as a fraction of the image height. */
  rough: number;
  /** Midpoint-displacement falloff; lower is smoother (dunes). */
  decay?: number;
  color: string;
  foot: string;
  /** Fill down to the bottom edge instead of the horizon. */
  toBottom?: boolean;
  snow?: boolean;
}

interface Scene {
  seed: number;
  horizon: number;
  sky: Array<[number, string]>;
  stars?: boolean;
  sun?: { x: number; y: number; r: number; color: string; glow: string; glowR: number };
  sunPath?: boolean;
  clouds: number;
  cloud?: string;
  mist?: boolean;
  layers: Layer[];
  water?: { top: string; bottom: string; reflect: number; tint?: string; ripple?: string };
  ground?: [string, string];
  rocks?: { base: number; span: number; color: string };
}

const SCENES = {
  fjord: {
    seed: 11,
    horizon: 0.58,
    sky: [
      [0, "#121c44"],
      [0.42, "#5d5490"],
      [0.74, "#e0937f"],
      [1, "#ffd49b"],
    ],
    sun: { x: 0.6, y: 0.29, r: 0.02, color: "#fff3da", glow: "rgba(255,186,134,.95)", glowR: 0.5 },
    sunPath: true,
    clouds: 7,
    cloud: "rgba(255,196,186,.14)",
    layers: [
      { base: 0.43, rough: 0.17, color: "#8a76a6", foot: "#6c5f91" },
      { base: 0.5, rough: 0.15, color: "#4f4b80", foot: "#33335f" },
      { base: 0.56, rough: 0.1, color: "#2a2b52", foot: "#191a3b" },
    ],
    water: { top: "#3b3f77", bottom: "#0c112e", reflect: 0.42 },
    rocks: { base: 0.84, span: 0.5, color: "#0b0c1a" },
  },
  desert: {
    seed: 4,
    horizon: 0.62,
    sky: [
      [0, "#24173f"],
      [0.5, "#8f4469"],
      [0.84, "#ee8659"],
      [1, "#ffcb87"],
    ],
    sun: {
      x: 0.26,
      y: 0.58,
      r: 0.028,
      color: "#ffe9bd",
      glow: "rgba(255,170,110,.85)",
      glowR: 0.45,
    },
    clouds: 3,
    layers: [
      { base: 0.6, rough: 0.06, decay: 0.42, color: "#c9784b", foot: "#94452a", toBottom: true },
      { base: 0.7, rough: 0.07, decay: 0.42, color: "#a4532f", foot: "#5c2714", toBottom: true },
      { base: 0.82, rough: 0.06, decay: 0.42, color: "#6d2f18", foot: "#2e1209", toBottom: true },
    ],
    ground: ["#7a3519", "#2a0f06"],
  },
  night: {
    seed: 23,
    horizon: 0.6,
    sky: [
      [0, "#03050c"],
      [0.55, "#0b1531"],
      [1, "#25365f"],
    ],
    stars: true,
    sun: { x: 0.74, y: 0.2, r: 0.02, color: "#f1eee2", glow: "rgba(170,190,255,.32)", glowR: 0.3 },
    clouds: 2,
    cloud: "rgba(150,170,220,.10)",
    layers: [
      { base: 0.48, rough: 0.16, color: "#24305a", foot: "#151d3b" },
      { base: 0.55, rough: 0.12, color: "#131a35", foot: "#0a0f22" },
    ],
    water: { top: "#18224a", bottom: "#04060e", reflect: 0.5, ripple: "200,215,255" },
  },
  forest: {
    seed: 8,
    horizon: 0.64,
    sky: [
      [0, "#8a9e95"],
      [0.6, "#c1ccbf"],
      [1, "#e3e7dc"],
    ],
    clouds: 0,
    mist: true,
    layers: [
      { base: 0.4, rough: 0.12, color: "#93a99a", foot: "#7f978a", toBottom: true },
      { base: 0.52, rough: 0.12, color: "#62806c", foot: "#4c6a58", toBottom: true },
      { base: 0.66, rough: 0.11, color: "#3c5a47", foot: "#2a4434", toBottom: true },
      { base: 0.82, rough: 0.09, color: "#20352a", foot: "#14231b", toBottom: true },
    ],
    ground: ["#20352a", "#14231b"],
  },
  alpine: {
    seed: 31,
    horizon: 0.6,
    sky: [
      [0, "#1c5cc4"],
      [0.6, "#68a5ea"],
      [1, "#d2e8ff"],
    ],
    sun: {
      x: 0.17,
      y: 0.15,
      r: 0.018,
      color: "#ffffff",
      glow: "rgba(255,255,255,.55)",
      glowR: 0.3,
    },
    clouds: 5,
    cloud: "rgba(255,255,255,.35)",
    layers: [
      { base: 0.38, rough: 0.2, color: "#b8c7dd", foot: "#8b9fbf", snow: true },
      { base: 0.48, rough: 0.15, color: "#5f7aa0", foot: "#3d5579" },
      { base: 0.56, rough: 0.1, color: "#2c4568", foot: "#1a2b47" },
    ],
    water: {
      top: "#2ba1b6",
      bottom: "#0a4659",
      reflect: 0.45,
      tint: "rgba(0,40,60,.18)",
      ripple: "230,250,255",
    },
  },
  sea: {
    seed: 17,
    horizon: 0.6,
    sky: [
      [0, "#281a3f"],
      [0.5, "#b04d78"],
      [0.84, "#f39167"],
      [1, "#ffd189"],
    ],
    sun: { x: 0.5, y: 0.55, r: 0.038, color: "#fff0c6", glow: "rgba(255,168,118,.9)", glowR: 0.5 },
    sunPath: true,
    clouds: 6,
    cloud: "rgba(255,190,180,.18)",
    layers: [],
    water: { top: "#6c3a5f", bottom: "#170d22", reflect: 0.35 },
  },
} satisfies Record<string, Scene>;

export type SampleScene = keyof typeof SCENES;

/** Deterministic PRNG (mulberry32), so every sample paints the same way each time. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Midpoint-displacement ridge: 2^n + 1 vertical offsets around zero. */
function ridge(n: number, rnd: () => number, rough: number, decay: number): Float32Array {
  const count = (1 << n) + 1;
  const p = new Float32Array(count);
  p[0] = (rnd() - 0.5) * rough;
  p[count - 1] = (rnd() - 0.5) * rough;
  let step = count - 1;
  let amp = rough;
  while (step > 1) {
    const half = step >> 1;
    for (let i = half; i < count; i += step) {
      p[i] = (p[i - half] + p[i + half]) / 2 + (rnd() - 0.5) * amp;
    }
    amp *= decay;
    step = half;
  }
  return p;
}

/** Paint a scene onto a new canvas. */
export function paintScene(name: SampleScene, width: number, height: number): HTMLCanvasElement {
  const scene: Scene = SCENES[name];
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const w = width;
  const h = height;
  const rnd = rng(scene.seed);
  const horizon = Math.round(h * scene.horizon);

  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  for (const [offset, color] of scene.sky) sky.addColorStop(offset, color);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, horizon + 1);

  if (scene.stars) {
    ctx.fillStyle = "#fff";
    for (let i = 0; i < 220; i++) {
      ctx.globalAlpha = 0.25 + rnd() * 0.75;
      const r = ((rnd() * 1.2 + 0.3) * w) / 1500 + 0.4;
      ctx.fillRect(rnd() * w, rnd() * horizon * 0.85, r, r);
    }
    ctx.globalAlpha = 1;
  }

  const sun = scene.sun;
  if (sun) {
    const sx = sun.x * w;
    const sy = sun.y * h;
    const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, w * sun.glowR);
    glow.addColorStop(0, sun.glow);
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, horizon + 1);
    ctx.fillStyle = sun.color;
    ctx.beginPath();
    ctx.arc(sx, sy, sun.r * w, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = 0; i < scene.clouds; i++) {
    ctx.fillStyle = scene.cloud ?? "rgba(255,220,210,.16)";
    ctx.beginPath();
    ctx.ellipse(
      rnd() * w,
      horizon * (0.12 + rnd() * 0.55),
      w * (0.12 + rnd() * 0.28),
      h * (0.006 + rnd() * 0.02),
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }

  const below = ctx.createLinearGradient(0, horizon, 0, h);
  const [belowTop, belowBottom] = scene.water
    ? [scene.water.top, scene.water.bottom]
    : (scene.ground ?? ["#222", "#111"]);
  below.addColorStop(0, belowTop);
  below.addColorStop(1, belowBottom);
  ctx.fillStyle = below;
  ctx.fillRect(0, horizon, w, h - horizon);

  for (const layer of scene.layers) {
    const off = ridge(9, rnd, layer.rough * h, layer.decay ?? 0.55);
    const bottom = layer.toBottom ? h : horizon;
    ctx.beginPath();
    ctx.moveTo(0, bottom);
    for (let i = 0; i < off.length; i++) {
      ctx.lineTo((i / (off.length - 1)) * w, Math.min(layer.base * h + off[i], bottom));
    }
    ctx.lineTo(w, bottom);
    ctx.closePath();
    const top = layer.base * h - layer.rough * h * 0.6;
    const fill = ctx.createLinearGradient(0, top, 0, bottom);
    fill.addColorStop(0, layer.color);
    fill.addColorStop(1, layer.foot);
    ctx.fillStyle = fill;
    ctx.fill();
    if (layer.snow) {
      ctx.save();
      ctx.clip();
      const snow = ctx.createLinearGradient(0, top - layer.rough * h * 0.4, 0, layer.base * h);
      snow.addColorStop(0, "rgba(255,255,255,.95)");
      snow.addColorStop(0.55, "rgba(240,246,255,.5)");
      snow.addColorStop(1, "rgba(240,246,255,0)");
      ctx.fillStyle = snow;
      ctx.fillRect(0, 0, w, layer.base * h);
      ctx.restore();
    }
    if (scene.mist) {
      const my = layer.base * h + layer.rough * h * 0.3;
      const mist = ctx.createLinearGradient(0, my - h * 0.06, 0, my + h * 0.06);
      mist.addColorStop(0, "rgba(235,240,232,0)");
      mist.addColorStop(0.5, "rgba(235,240,232,.42)");
      mist.addColorStop(1, "rgba(235,240,232,0)");
      ctx.fillStyle = mist;
      ctx.fillRect(0, my - h * 0.06, w, h * 0.12);
    }
  }

  const water = scene.water;
  if (water) {
    // Mirror everything above the horizon into the water, then darken it.
    ctx.save();
    ctx.globalAlpha = water.reflect;
    ctx.translate(0, 2 * horizon);
    ctx.scale(1, -1);
    ctx.drawImage(canvas, 0, 0, w, horizon, 0, 0, w, horizon);
    ctx.restore();
    ctx.fillStyle = water.tint ?? "rgba(10,14,34,.28)";
    ctx.fillRect(0, horizon, w, h - horizon);
    for (let i = 0; i < 140; i++) {
      const y = horizon + rnd() ** 1.7 * (h - horizon);
      ctx.fillStyle = `rgba(${water.ripple ?? "255,232,214"},${0.03 + rnd() * 0.09})`;
      ctx.fillRect(rnd() * w, y, w * (0.015 + rnd() * 0.1), Math.max(1, h / 650));
    }
    if (scene.sunPath && sun) {
      const sx = sun.x * w;
      for (let i = 0; i < 80; i++) {
        const y = horizon + rnd() * (h - horizon) * 0.85;
        const spread = ((y - horizon) / (h - horizon)) * w * 0.08 + w * 0.01;
        const len = w * (0.01 + rnd() * 0.05);
        ctx.fillStyle = `rgba(255,226,170,${0.12 + rnd() * 0.35})`;
        ctx.fillRect(sx - spread + rnd() * spread * 2 - len / 2, y, len, Math.max(1, h / 500));
      }
    }
  }

  if (scene.rocks) {
    const { base, span, color } = scene.rocks;
    const off = ridge(8, rnd, h * 0.1, 0.5);
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let i = 0; i < off.length; i++) {
      const t = i / (off.length - 1);
      ctx.lineTo(t * w * span, h * base + off[i] + t * h * 0.12);
    }
    ctx.lineTo(w * span, h);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  // A gentle lens vignette, so it reads as a photo rather than a diagram.
  const vignette = ctx.createRadialGradient(
    w / 2,
    h / 2,
    Math.min(w, h) * 0.35,
    w / 2,
    h / 2,
    Math.max(w, h) * 0.75,
  );
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,.28)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);
  return canvas;
}

/** A sample photo as a JPEG `File`, ready for `addFiles()`. */
export function sampleFile(name: SampleScene, width: number, height: number): Promise<File> {
  const canvas = paintScene(name, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(new File([blob], `${name}.jpg`, { type: "image/jpeg" }))
          : reject(new Error(`Couldn't encode the ${name} sample`)),
      "image/jpeg",
      0.9,
    );
  });
}

/** Five varied sample photos: landscape, portrait, square and wide frames. */
export function samplePhotos(): Promise<File[]> {
  return Promise.all([
    sampleFile("fjord", 1600, 1067),
    sampleFile("forest", 1200, 1500),
    sampleFile("night", 1600, 900),
    sampleFile("sea", 1200, 1200),
    sampleFile("alpine", 1600, 1067),
  ]);
}
