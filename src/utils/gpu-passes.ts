import type { StylizeEffect } from "../types";
import type { CurveLuts } from "./curves";
import { detailIsNeutral } from "./detail";
import type { HueTable } from "./hsl";
import type { PreparedMask } from "./masks";
import { clamp } from "./math";
import { hexToRgb, stylizeIsNeutral } from "./stylize";

/**
 * The per-pixel post passes — clarity and dehaze, masks, the HSL mixer,
 * curves and stylize — on the GPU, for the live preview. Each shader follows
 * its CPU twin (detail.ts, masks.ts, hsl.ts, curves.ts, stylize.ts) and
 * rounds to 8 bits between passes as they do, so the two agree to a level
 * or so. The wide blurs (clarity, tilt-shift) run at a reduced size past
 * MAX_RADIUS and scale back up, which a soft blur doesn't show. The CPU
 * passes stay the reference: export runs them, and so does the preview
 * wherever WebGL2 is missing or fails.
 */

export interface PostPasses {
  clarity: number;
  dehaze: number;
  masks: PreparedMask[];
  hueTable: HueTable | null;
  curveLuts: CurveLuts | null;
  stylize: StylizeEffect;
}

/** True when no post pass would change a pixel. */
export function postPassesAreNeutral(p: PostPasses): boolean {
  return (
    detailIsNeutral(p.clarity, p.dehaze) &&
    p.masks.length === 0 &&
    !p.hueTable &&
    !p.curveLuts &&
    stylizeIsNeutral(p.stylize)
  );
}

/** Widest box radius a blur pass runs at full size; wider ones run smaller. */
const MAX_RADIUS = 32;
/** Masks per shader run; more take another run. */
const MAX_MASKS = 8;

const VERTEX = `#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }`;

// Rows are counted from the top in every texture here (canvases upload top
// row first), so gl_FragCoord.y is the image row; only the final copy to
// the canvas flips.
const HEAD = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D u_src;
uniform ivec2 u_size;
out vec4 o;
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
ivec2 px() { return ivec2(gl_FragCoord.xy); }
vec2 uv() { return gl_FragCoord.xy / vec2(u_size); }
// Round to a whole 0–255 level, as a Uint8ClampedArray store does.
float to8(float v) { return floor(v + 0.5); }
vec3 to8(vec3 v) { return floor(v + 0.5); }
`;

const SHADERS = {
  copy: `
uniform int u_flip;
void main() {
  ivec2 p = px();
  if (u_flip == 1) p.y = u_size.y - 1 - p.y;
  o = texelFetch(u_src, p, 0);
}`,
  luma: `
void main() {
  o = vec4(vec3(dot(texelFetch(u_src, px(), 0).rgb, LUMA)), 1.0);
}`,
  // Average the source pixels under each output pixel.
  shrink: `
void main() {
  ivec2 s = textureSize(u_src, 0);
  vec2 f = vec2(s) / vec2(u_size);
  ivec2 a = ivec2(floor(vec2(px()) * f));
  ivec2 b = min(s, max(a + 1, ivec2(floor(vec2(px() + 1) * f))));
  vec4 sum = vec4(0.0);
  for (int y = a.y; y < b.y; y++)
    for (int x = a.x; x < b.x; x++) sum += texelFetch(u_src, ivec2(x, y), 0);
  o = sum / float((b.x - a.x) * (b.y - a.y));
}`,
  box: `
uniform int u_r;
uniform ivec2 u_dir;
// Taps in pairs, one linear read each: halfway between two texels averages
// them, and the clamped coordinate repeats the edge as the CPU blur does.
void main() {
  vec2 size = vec2(textureSize(u_src, 0));
  vec2 dir = vec2(u_dir);
  vec4 sum = vec4(0.0);
  int i = -u_r;
  for (; i < u_r; i += 2) sum += 2.0 * texture(u_src, (gl_FragCoord.xy + dir * (float(i) + 0.5)) / size);
  sum += texture(u_src, (gl_FragCoord.xy + dir * float(i)) / size);
  o = sum / float(2 * u_r + 1);
}`,
  detail: `
uniform sampler2D u_blur;
uniform float u_amount;
uniform float u_dehaze;
void main() {
  vec4 t = texelFetch(u_src, px(), 0);
  vec3 c = t.rgb * 255.0;
  if (u_amount != 0.0) {
    float l = dot(c, LUMA);
    float blurred = texture(u_blur, uv()).r * 255.0;
    float mid = 1.0 - abs(l - 128.0) / 128.0;
    c = to8(clamp(c + u_amount * mid * (l - blurred), 0.0, 255.0));
  }
  if (u_dehaze > 0.0) {
    float lift = 28.0 * u_dehaze;
    float gain = 1.0 + 0.3 * u_dehaze;
    c = clamp((c - lift) * gain * vec3(1.0, 1.0, 1.0 - 0.06 * u_dehaze), 0.0, 255.0);
  }
  o = vec4(to8(c) / 255.0, t.a);
}`,
  masks: `
uniform int u_count;
uniform vec4 u_geom[${MAX_MASKS}];
uniform ivec2 u_flags[${MAX_MASKS}];
uniform vec4 u_rows[${MAX_MASKS * 3}];
float smooth01(float t) { float x = clamp(t, 0.0, 1.0); return x * x * (3.0 - 2.0 * x); }
float alphaAt(int k, vec2 n) {
  vec4 g = u_geom[k];
  float a;
  if (u_flags[k].x == 0) {
    vec2 d = g.zw - g.xy;
    float len2 = dot(d, d);
    a = len2 < 1e-6 ? 1.0 : smooth01(1.0 - dot(n - g.xy, d) / len2);
  } else {
    vec2 r = max(vec2(0.02), abs(g.zw - g.xy));
    a = smooth01((1.4 - length((n - g.xy) / r)) / 0.8);
  }
  return u_flags[k].y == 1 ? 1.0 - a : a;
}
void main() {
  ivec2 p = px();
  vec4 t = texelFetch(u_src, p, 0);
  vec3 c = t.rgb * 255.0;
  vec2 n = vec2(
    u_size.x > 1 ? float(p.x) / float(u_size.x - 1) : 0.5,
    u_size.y > 1 ? float(p.y) / float(u_size.y - 1) : 0.5
  );
  for (int k = 0; k < ${MAX_MASKS}; k++) {
    if (k >= u_count) break;
    float a = alphaAt(k, n);
    if (a < 1e-3) continue;
    vec4 r = u_rows[k * 3];
    vec4 g = u_rows[k * 3 + 1];
    vec4 b = u_rows[k * 3 + 2];
    vec3 to = vec3(dot(r.xyz, c) + r.w, dot(g.xyz, c) + g.w, dot(b.xyz, c) + b.w);
    c = to8(clamp(c + (to - c) * a, 0.0, 255.0));
  }
  o = vec4(c / 255.0, t.a);
}`,
  hsl: `
uniform sampler2D u_table;
float channel(float p, float q, float tc) {
  float t = fract(tc);
  if (t < 1.0 / 6.0) return p + (q - p) * 6.0 * t;
  if (t < 0.5) return q;
  if (t < 2.0 / 3.0) return p + (q - p) * (2.0 / 3.0 - t) * 6.0;
  return p;
}
void main() {
  vec4 t = texelFetch(u_src, px(), 0);
  vec3 c = t.rgb;
  float mx = max(c.r, max(c.g, c.b));
  float mn = min(c.r, min(c.g, c.b));
  float l = (mx + mn) / 2.0;
  float d = mx - mn;
  float s = l > 0.5 ? d / (2.0 - mx - mn) : d / (mx + mn);
  float weight = min(1.0, s * 3.0);
  if (d < 1e-4 || weight < 1e-3) { o = t; return; }
  float h;
  if (mx == c.r) h = ((c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0)) / 6.0;
  else if (mx == c.g) h = ((c.b - c.r) / d + 2.0) / 6.0;
  else h = ((c.r - c.g) / d + 4.0) / 6.0;
  vec4 e = texelFetch(u_table, ivec2(min(359, int(floor(h * 360.0))), 0), 0);
  float h2 = fract(h + (e.x / 360.0) * weight);
  float s2 = clamp(s * (1.0 + (e.y - 1.0) * weight), 0.0, 1.0);
  float shift = e.z * weight;
  float l2 = clamp(l + shift * (shift > 0.0 ? 1.0 - l : l), 0.0, 1.0);
  float q = l2 < 0.5 ? l2 * (1.0 + s2) : l2 + s2 - l2 * s2;
  float p = 2.0 * l2 - q;
  vec3 rgb = vec3(channel(p, q, h2 + 1.0 / 3.0), channel(p, q, h2), channel(p, q, h2 - 1.0 / 3.0));
  o = vec4(to8(rgb * 255.0) / 255.0, t.a);
}`,
  curves: `
uniform sampler2D u_lut;
void main() {
  vec4 t = texelFetch(u_src, px(), 0);
  ivec3 i = ivec3(to8(t.rgb * 255.0));
  o = vec4(
    texelFetch(u_lut, ivec2(i.r, 0), 0).r,
    texelFetch(u_lut, ivec2(i.g, 0), 0).g,
    texelFetch(u_lut, ivec2(i.b, 0), 0).b,
    t.a
  );
}`,
  posterize: `
uniform float u_step;
void main() {
  vec4 t = texelFetch(u_src, px(), 0);
  vec3 v = to8(t.rgb * 255.0);
  o = vec4(to8(to8(v / u_step) * u_step) / 255.0, t.a);
}`,
  duotone: `
uniform vec3 u_shadow;
uniform vec3 u_highlight;
uniform float u_mix;
void main() {
  vec4 t = texelFetch(u_src, px(), 0);
  vec3 c = t.rgb * 255.0;
  float k = dot(c, LUMA) / 255.0;
  vec3 duo = u_shadow * (1.0 - k) + u_highlight * k;
  o = vec4(to8(c * (1.0 - u_mix) + duo * u_mix) / 255.0, t.a);
}`,
  // One output pixel per block: the block's average (edge blocks are partial).
  // With u_luma, the block's mean luminance instead, in two bytes (whole
  // levels, then the fraction) so halftone dots size as finely as on the CPU.
  blocks: `
uniform int u_block;
uniform int u_luma;
void main() {
  ivec2 s = textureSize(u_src, 0);
  ivec2 a = px() * u_block;
  ivec2 b = min(a + u_block, s);
  vec4 sum = vec4(0.0);
  for (int y = a.y; y < b.y; y++)
    for (int x = a.x; x < b.x; x++) sum += texelFetch(u_src, ivec2(x, y), 0);
  vec4 mean = sum / float((b.x - a.x) * (b.y - a.y));
  if (u_luma == 0) { o = mean; return; }
  float lum = dot(mean.rgb * 255.0, LUMA);
  o = vec4(floor(lum) / 255.0, fract(lum), 0.0, 1.0);
}`,
  pixelate: `
uniform sampler2D u_blocks;
uniform int u_block;
void main() {
  ivec2 p = px();
  o = vec4(texelFetch(u_blocks, p / u_block, 0).rgb, texelFetch(u_src, p, 0).a);
}`,
  halftone: `
uniform sampler2D u_blocks;
uniform int u_block;
void main() {
  ivec2 p = px();
  ivec2 cell = p / u_block;
  ivec2 a = cell * u_block;
  vec2 size = vec2(min(a + u_block, u_size) - a);
  vec4 mean = texelFetch(u_blocks, cell, 0);
  float lum = to8(mean.r * 255.0) + mean.g;
  float r = (1.0 - lum / 255.0) * float(u_block) / 2.0 * 1.25;
  vec2 d = vec2(p - a) - size / 2.0 + 0.5;
  float ink = dot(d, d) <= r * r ? 20.0 : 245.0;
  o = vec4(vec3(ink / 255.0), texelFetch(u_src, p, 0).a);
}`,
  tiltshift: `
uniform sampler2D u_blur;
uniform float u_center;
void main() {
  ivec2 p = px();
  vec4 t = texelFetch(u_src, p, 0);
  float ny = u_size.y > 1 ? float(p.y) / float(u_size.y - 1) : 0.5;
  float w = clamp((abs(ny - u_center) - 0.16) / 0.18, 0.0, 1.0);
  w = w * w * (3.0 - 2.0 * w);
  vec3 blurred = texture(u_blur, uv()).rgb;
  o = vec4(to8((t.rgb * (1.0 - w) + blurred * w) * 255.0) / 255.0, t.a);
}`,
} as const;

type ShaderName = keyof typeof SHADERS;

interface Program {
  program: WebGLProgram;
  locations: Map<string, WebGLUniformLocation | null>;
}

interface Target {
  tex: WebGLTexture;
  fb: WebGLFramebuffer;
  w: number;
  h: number;
}

/** A number, or the components of a vector (or a uniform array's, named `x[0]`). */
type Uniform = number | number[];

interface Run {
  /** Textures by sampler name; u_src is the input. */
  textures: Record<string, WebGLTexture>;
  ints?: Record<string, Uniform>;
  floats?: Record<string, Uniform>;
}

export class GpuPasses {
  private readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGL2RenderingContext;
  private readonly programs = new Map<ShaderName, Program>();
  private readonly targets = new Map<string, Target>();
  private readonly maxSize: number;
  private hueTex: WebGLTexture | null = null;
  private hueFor: HueTable | null = null;
  private lutTex: WebGLTexture | null = null;
  private lutFor: CurveLuts | null = null;
  private lost = false;

  /** A GPU pass runner, or null where WebGL2 isn't available. */
  static create(): GpuPasses | null {
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl2", {
        alpha: true,
        premultipliedAlpha: false,
        antialias: false,
        depth: false,
        stencil: false,
      });
      return gl ? new GpuPasses(canvas, gl) : null;
    } catch {
      return null;
    }
  }

  private constructor(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext) {
    this.canvas = canvas;
    this.gl = gl;
    this.maxSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    canvas.addEventListener("webglcontextlost", () => {
      this.lost = true;
    });

    // One triangle covers the viewport.
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.disable(gl.BLEND);
  }

  /**
   * Run the passes over `source` and draw the result back into `ctx` (its
   * own canvas). False when the GPU couldn't, so the caller runs the CPU
   * passes instead.
   */
  apply(ctx: CanvasRenderingContext2D, source: HTMLCanvasElement, passes: PostPasses): boolean {
    const { gl } = this;
    const w = source.width;
    const h = source.height;
    if (this.lost || gl.isContextLost() || w === 0 || h === 0) return false;
    if (w > this.maxSize || h > this.maxSize) return false;
    try {
      const input = this.target("in", w, h);
      gl.bindTexture(gl.TEXTURE_2D, input.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
      let cur = input;
      // Ping-pong between two full-size targets.
      const step = (name: ShaderName, run: Run): void => {
        const out = this.target(cur.tex === this.targets.get("a")?.tex ? "b" : "a", w, h);
        this.run(name, out, run);
        cur = out;
      };

      if (passes.clarity !== 0 || passes.dehaze > 0) {
        let blur = cur;
        if (passes.clarity !== 0) {
          this.run("luma", this.target("luma", w, h), { textures: { u_src: cur.tex } });
          const radius = Math.max(2, Math.round(Math.min(w, h) * 0.015));
          blur = this.blur(this.target("luma", w, h), radius, 3);
        }
        step("detail", {
          textures: { u_src: cur.tex, u_blur: blur.tex },
          floats: {
            u_amount: (passes.clarity / 100) * 0.8,
            u_dehaze: Math.max(0, passes.dehaze) / 100,
          },
        });
      }

      for (let i = 0; i < passes.masks.length; i += MAX_MASKS) {
        const chunk = passes.masks.slice(i, i + MAX_MASKS);
        const geom: number[] = [];
        const flags: number[] = [];
        const rows: number[] = [];
        for (const { mask, matrix: m } of chunk) {
          geom.push(mask.x0, mask.y0, mask.x1, mask.y1);
          flags.push(mask.kind === "linear" ? 0 : 1, mask.invert ? 1 : 0);
          rows.push(m[0], m[1], m[2], m[4], m[5], m[6], m[7], m[9], m[10], m[11], m[12], m[14]);
        }
        step("masks", {
          textures: { u_src: cur.tex },
          ints: { u_count: chunk.length, "u_flags[0]": flags },
          floats: { "u_geom[0]": geom, "u_rows[0]": rows },
        });
      }

      if (passes.hueTable) {
        step("hsl", { textures: { u_src: cur.tex, u_table: this.hueTexture(passes.hueTable) } });
      }

      if (passes.curveLuts) {
        step("curves", { textures: { u_src: cur.tex, u_lut: this.lutTexture(passes.curveLuts) } });
      }

      const effect = passes.stylize;
      if (!stylizeIsNeutral(effect)) {
        const amount = clamp(effect.amount, 0, 100);
        if (effect.kind === "posterize") {
          const levels = clamp(Math.round(16 - (amount / 100) * 13), 3, 16);
          step("posterize", {
            textures: { u_src: cur.tex },
            floats: { u_step: 255 / (levels - 1) },
          });
        } else if (effect.kind === "duotone") {
          step("duotone", {
            textures: { u_src: cur.tex },
            floats: {
              u_shadow: hexToRgb(effect.shadow),
              u_highlight: hexToRgb(effect.highlight),
              u_mix: amount / 100,
            },
          });
        } else if (effect.kind === "pixelate" || effect.kind === "halftone") {
          const block =
            effect.kind === "pixelate"
              ? clamp(Math.round(2 + (amount / 100) * 46), 2, 64)
              : clamp(Math.round(4 + (amount / 100) * 18), 4, 32);
          const blocks = this.target("blocks", Math.ceil(w / block), Math.ceil(h / block));
          this.run("blocks", blocks, {
            textures: { u_src: cur.tex },
            ints: { u_block: block, u_luma: effect.kind === "halftone" ? 1 : 0 },
          });
          step(effect.kind, {
            textures: { u_src: cur.tex, u_blocks: blocks.tex },
            ints: { u_block: block },
          });
        } else {
          const radius = Math.max(2, Math.round((amount / 100) * Math.min(w, h) * 0.02));
          const blur = this.blur(cur, radius, 2);
          step("tiltshift", {
            textures: { u_src: cur.tex, u_blur: blur.tex },
            floats: { u_center: clamp(effect.position, 0, 1) },
          });
        }
      }

      if (cur === input) return true;
      if (this.canvas.width !== w || this.canvas.height !== h) {
        this.canvas.width = w;
        this.canvas.height = h;
      }
      this.run("copy", null, { textures: { u_src: cur.tex }, ints: { u_flip: 1 } });
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = "copy";
      ctx.drawImage(this.canvas, 0, 0);
      ctx.restore();
      return !gl.isContextLost();
    } catch {
      this.lost = true;
      return false;
    }
  }

  dispose(): void {
    this.gl.getExtension("WEBGL_lose_context")?.loseContext();
    this.lost = true;
  }

  /**
   * `passes` rounds of a separable box blur (horizontal, then vertical) at
   * `radius`, like the CPU blurs; past MAX_RADIUS the image shrinks first so
   * the radius fits, and the result is read back up with linear filtering.
   */
  private blur(src: Target, radius: number, passes: number): Target {
    let cur = src;
    let r = radius;
    if (r > MAX_RADIUS) {
      const f = MAX_RADIUS / r;
      const small = this.target(
        "blur-in",
        Math.max(1, Math.round(src.w * f)),
        Math.max(1, Math.round(src.h * f)),
      );
      this.run("shrink", small, { textures: { u_src: cur.tex } });
      cur = small;
      r = MAX_RADIUS;
    }
    for (let i = 0; i < passes; i++) {
      for (const dir of [
        [1, 0],
        [0, 1],
      ] as [number, number][]) {
        const out = this.target(
          cur.tex === this.targets.get("blur-a")?.tex ? "blur-b" : "blur-a",
          cur.w,
          cur.h,
        );
        this.run("box", out, { textures: { u_src: cur.tex }, ints: { u_r: r, u_dir: dir } });
        cur = out;
      }
    }
    return cur;
  }

  /** Draw a full-viewport triangle with `name` into `out` (null: the canvas). */
  private run(name: ShaderName, out: Target | null, run: Run): void {
    const { gl } = this;
    const program = this.program(name);
    gl.useProgram(program.program);
    gl.bindFramebuffer(gl.FRAMEBUFFER, out?.fb ?? null);
    const w = out?.w ?? this.canvas.width;
    const h = out?.h ?? this.canvas.height;
    gl.viewport(0, 0, w, h);
    const loc = (n: string): WebGLUniformLocation | null => {
      if (!program.locations.has(n))
        program.locations.set(n, gl.getUniformLocation(program.program, n));
      return program.locations.get(n) ?? null;
    };
    gl.uniform2i(loc("u_size"), w, h);
    let unit = 0;
    for (const [n, tex] of Object.entries(run.textures)) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(loc(n), unit++);
    }
    for (const [n, v] of Object.entries(run.ints ?? {})) {
      const l = loc(n);
      // Integer vectors here are all ivec2.
      if (typeof v === "number") gl.uniform1i(l, v);
      else gl.uniform2iv(l, v);
    }
    for (const [n, v] of Object.entries(run.floats ?? {})) {
      const l = loc(n);
      // Float arrays here hold vec4s; lone float vectors are vec3s.
      if (typeof v === "number") gl.uniform1f(l, v);
      else if (n.endsWith("[0]")) gl.uniform4fv(l, v);
      else gl.uniform3fv(l, v);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private program(name: ShaderName): Program {
    const cached = this.programs.get(name);
    if (cached) return cached;
    const { gl } = this;
    const compile = (type: number, source: string): WebGLShader => {
      const shader = gl.createShader(type);
      if (!shader) throw new Error("[Retouch] Couldn't create a shader");
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(`[Retouch] ${name} shader: ${gl.getShaderInfoLog(shader)}`);
      }
      return shader;
    };
    const program = gl.createProgram();
    if (!program) throw new Error("[Retouch] Couldn't create a program");
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, HEAD + SHADERS[name]));
    gl.bindAttribLocation(program, 0, "a_pos");
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`[Retouch] ${name} program: ${gl.getProgramInfoLog(program)}`);
    }
    const entry = { program, locations: new Map() };
    this.programs.set(name, entry);
    return entry;
  }

  /** An 8-bit render target, kept by name and resized as needed. */
  private target(name: string, w: number, h: number): Target {
    const { gl } = this;
    let t = this.targets.get(name);
    if (!t) {
      const tex = this.texture();
      const fb = gl.createFramebuffer();
      if (!fb) throw new Error("[Retouch] Couldn't create a framebuffer");
      t = { tex, fb, w: 0, h: 0 };
      this.targets.set(name, t);
    }
    if (t.w !== w || t.h !== h) {
      gl.bindTexture(gl.TEXTURE_2D, t.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.tex, 0);
      t.w = w;
      t.h = h;
    }
    return t;
  }

  private texture(): WebGLTexture {
    const { gl } = this;
    const tex = gl.createTexture();
    if (!tex) throw new Error("[Retouch] Couldn't create a texture");
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  /** The mixer's 360-entry table as a float texture: hue shift, saturation ×, luminance shift. */
  private hueTexture(table: HueTable): WebGLTexture {
    const { gl } = this;
    if (!this.hueTex) {
      this.hueTex = this.texture();
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    }
    if (this.hueFor !== table) {
      const data = new Float32Array(360 * 4);
      for (let i = 0; i < 360; i++) {
        data[i * 4] = table.dh[i];
        data[i * 4 + 1] = table.sMul[i];
        data[i * 4 + 2] = table.dl[i];
      }
      gl.bindTexture(gl.TEXTURE_2D, this.hueTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 360, 1, 0, gl.RGBA, gl.FLOAT, data);
      this.hueFor = table;
    }
    return this.hueTex;
  }

  /** The three curve LUTs as one 256×1 texture (r, g, b). */
  private lutTexture(luts: CurveLuts): WebGLTexture {
    const { gl } = this;
    if (!this.lutTex) this.lutTex = this.texture();
    if (this.lutFor !== luts) {
      const data = new Uint8Array(256 * 4);
      for (let i = 0; i < 256; i++) {
        data[i * 4] = luts.r[i];
        data[i * 4 + 1] = luts.g[i];
        data[i * 4 + 2] = luts.b[i];
        data[i * 4 + 3] = 255;
      }
      gl.bindTexture(gl.TEXTURE_2D, this.lutTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
      this.lutFor = luts;
    }
    return this.lutTex;
  }
}
