import type { BackdropBaseModifier, BackdropCamera, BackdropFrame, BackdropLayer, BackdropLayerContext, BackdropLayerSpec, BackdropMaskChannel } from "../types";
import { registerLayer } from "./registry";
import { FLICKER_FS, FOG_FS, PARTICLE_FS, PARTICLE_VS, QUAD_VS } from "./shaders";

const numberParam = (spec: BackdropLayerSpec, key: string, fallback: number): number => {
  const value = spec.params[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
};

export const hexColor = (value: unknown, fallback: [number, number, number]): [number, number, number] => {
  if (typeof value !== "string") return fallback;
  const hex = value.trim().replace(/^#/, "");
  const full = hex.length === 3 ? hex.split("").map((part) => part + part).join("") : hex;
  if (!/^[0-9a-f]{6}$/i.test(full)) return fallback;
  return [0, 2, 4].map((offset) => parseInt(full.slice(offset, offset + 2), 16) / 255) as [number, number, number];
};

interface Tuning { intensity: number; speed: number; wind: number; color: [number, number, number] }

const tuning = (spec: BackdropLayerSpec, color: [number, number, number]): Tuning => ({
  intensity: numberParam(spec, "intensity", 0.6), speed: numberParam(spec, "speed", 1), wind: numberParam(spec, "wind", 0), color: hexColor(spec.params.color, color),
});

export const easeFactor = (dt: number, halfLife: number): number => 1 - 0.5 ** (Math.max(0, dt) / halfLife);

export class Phase {
  value = 0;
  private rate: number | null = null;
  get speed(): number { return this.rate ?? 0; }
  advance(dt: number, target: number, halfLife = 1.5): number {
    this.rate = this.rate === null ? target : this.rate + (target - this.rate) * easeFactor(dt, halfLife);
    this.value += Math.max(0, dt) * this.rate;
    return this.value;
  }
}

export const PARTICLE_KINDS = { rain: 0, snow: 1, embers: 2, dust: 3, fireflies: 4 } as const;
type ParticleKind = keyof typeof PARTICLE_KINDS;

const PARTICLE_DEFAULTS: Record<ParticleKind, { count: number; color: [number, number, number]; order: number; tinted: boolean }> = {
  rain: { count: 1500, color: [0.8, 0.85, 0.92], order: 20, tinted: true },
  snow: { count: 1100, color: [0.95, 0.96, 1], order: 20, tinted: true },
  embers: { count: 900, color: [1, 0.62, 0.22], order: 22, tinted: false },
  dust: { count: 260, color: [1, 0.94, 0.82], order: 24, tinted: true },
  fireflies: { count: 70, color: [0.86, 1, 0.45], order: 24, tinted: false },
};

export const areaScale = (width: number, height: number): number => Math.min(1.6, Math.max(0.35, (width * height) / (1920 * 1080)));

export const particleCount = (kind: ParticleKind, width: number, height: number): number => Math.max(1, Math.round(PARTICLE_DEFAULTS[kind].count * areaScale(width, height)));

export const particleDensity = (amount: number): number => amount <= 0 ? 0 : Math.min(1, 0.3 + 0.7 * amount) * Math.min(1, amount / 0.08);

const sceneBinder = (context: BackdropLayerContext, program: WebGLProgram) => (frame: BackdropFrame, unit: number) => context.bindScene(program, frame.camera, unit);

const particleLayer = (kind: ParticleKind) => (context: BackdropLayerContext, initial: BackdropLayerSpec): BackdropLayer => {
  const gl = context.gl;
  const program = context.program(PARTICLE_VS, PARTICLE_FS);
  const vao = gl.createVertexArray();
  const defaults = PARTICLE_DEFAULTS[kind];
  let tune = tuning(initial, defaults.color);
  const phase = new Phase();
  const blow = new Phase();
  const at = (name: string) => gl.getUniformLocation(program, name);
  const u = { drift: at("uDrift"), phase: at("uPhase"), time: at("uTime"), res: at("uRes"), kind: at("uKind"), scale: at("uScale"), color: at("uColor"), intensity: at("uIntensity"),
    density: at("uDensity"), wind: at("uWind") };
  const scene = sceneBinder(context, program);
  return {
    kind, order: defaults.order, fps: 60,
    update: (spec) => { tune = tuning(spec, defaults.color); },
    draw: (frame: BackdropFrame) => {
      const amount = tune.intensity * frame.intensity;
      const position = phase.advance(frame.dt, tune.speed);
      const carried = blow.advance(frame.dt, tune.wind * tune.speed);
      if (amount <= 0.002) return;
      gl.useProgram(program);
      gl.bindVertexArray(vao);
      scene(frame, 4);
      gl.uniform1f(u.phase, position);
      gl.uniform1f(u.time, frame.time);
      gl.uniform2f(u.res, frame.width, frame.height);
      gl.uniform1i(u.kind, PARTICLE_KINDS[kind]);
      gl.uniform1f(u.scale, frame.dpr);
      gl.uniform1f(u.density, particleDensity(amount));
      gl.uniform1f(u.wind, blow.speed / Math.max(0.1, tune.speed));
      gl.uniform1f(u.drift, carried);
      gl.uniform3fv(u.color, tune.color.map((channel, index) => channel * (defaults.tinted ? frame.tint[index] : 1)));
      gl.uniform1f(u.intensity, Math.min(1, 0.55 + 0.6 * amount));
      gl.drawArrays(gl.TRIANGLES, 0, particleCount(kind, frame.width / frame.dpr, frame.height / frame.dpr) * 6);
    },
    dispose: () => { gl.deleteVertexArray(vao); },
  };
};

const fog = (context: BackdropLayerContext, initial: BackdropLayerSpec): BackdropLayer => {
  const gl = context.gl;
  const program = context.program(QUAD_VS, FOG_FS);
  const color: [number, number, number] = [0.82, 0.85, 0.9];
  let tune = tuning(initial, color);
  const phase = new Phase();
  const at = (name: string) => gl.getUniformLocation(program, name);
  const u = { phase: at("uPhase"), intensity: at("uIntensity"), color: at("uColor"), aspect: at("uAspect") };
  const scene = sceneBinder(context, program);
  return {
    kind: "fog", order: 18, fps: 30,
    update: (spec) => { tune = tuning(spec, color); },
    draw: (frame) => {
      const amount = tune.intensity * frame.intensity;
      const position = phase.advance(frame.dt, tune.speed);
      if (amount <= 0.01) return;
      gl.useProgram(program);
      scene(frame, 4);
      gl.uniform1f(u.phase, position);
      gl.uniform1f(u.intensity, Math.min(1, amount * 1.4));
      gl.uniform3fv(u.color, tune.color.map((channel, index) => channel * frame.tint[index]));
      gl.uniform1f(u.aspect, frame.width / Math.max(1, frame.height));
      context.drawQuad();
    },
    dispose: () => undefined,
  };
};

export interface Stroke { at: number; peak: number }

export const lightningStrokes = (seed: number): Stroke[] => {
  const random = (n: number) => { const x = Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453; return x - Math.floor(x); };
  const count = 1 + Math.floor(random(1) * 3);
  return Array.from({ length: count }, (_, index) => ({ at: index === 0 ? 0 : 0.06 + index * 0.09 + random(index + 2) * 0.08, peak: index === 0 ? 1 : 0.45 + random(index + 7) * 0.4 }));
};

export const flashAt = (strokes: readonly Stroke[], since: number): number =>
  strokes.reduce((total, stroke) => since < stroke.at ? total : Math.max(total, stroke.peak * Math.exp(-(since - stroke.at) / 0.07)), 0);

export const flameFlicker = (time: number): number => {
  const wave = (rate: number, offset: number) => Math.sin(time * rate + offset) * Math.sin(time * rate * 0.61 + offset * 1.7);
  return 0.55 * wave(1.3, 0.4) + 0.3 * wave(2.9, 2.1) + 0.15 * wave(5.3, 5.7);
};

const flicker = (context: BackdropLayerContext, initial: BackdropLayerSpec): BackdropLayer => {
  const gl = context.gl;
  const program = context.program(QUAD_VS, FLICKER_FS);
  const color: [number, number, number] = [1, 0.69, 0.38];
  let tune = tuning(initial, color);
  let lightning = initial.params.lightning === true;
  let strikes = 0, next: number | null = null, started = -1, strokes: Stroke[] = [];
  const phase = new Phase();
  const at = (name: string) => gl.getUniformLocation(program, name);
  const u = { intensity: at("uIntensity"), color: at("uColor"), flash: at("uFlash"), flicker: at("uFlicker") };
  const scene = sceneBinder(context, program);
  return {
    kind: "flicker", order: 30, fps: 30,
    update: (spec) => {
      tune = tuning(spec, color);
      if ((spec.params.lightning === true) !== lightning) { next = null; started = -1; }
      lightning = spec.params.lightning === true;
    },
    draw: (frame) => {
      const amount = tune.intensity * frame.intensity;
      const position = phase.advance(frame.dt, tune.speed);
      if (amount <= 0.01) return;
      let flash = 0;
      if (lightning) {
        if (next === null) next = frame.time + 4 + 6 * Math.random();
        if (frame.time >= next) { strikes += 1; started = frame.time; strokes = lightningStrokes(strikes + Math.floor(frame.time)); next = frame.time + 7 + 13 * Math.random(); }
        if (started >= 0) flash = flashAt(strokes, frame.time - started);
      }
      gl.useProgram(program);
      scene(frame, 4);
      gl.uniform1f(u.intensity, Math.min(1, amount * 1.3));
      gl.uniform3fv(u.color, lightning ? [0.78, 0.85, 1] : tune.color);
      gl.uniform1f(u.flash, flash * Math.min(1, 0.4 + amount));
      gl.uniform1f(u.flicker, lightning ? 0 : flameFlicker(position) * 0.35);
      context.drawQuad();
    },
    dispose: () => undefined,
  };
};

const maskChannel = (value: unknown): BackdropMaskChannel => value === "sky" ? "sky" : value === "none" ? "all" : "water";

const shimmer = (context: BackdropLayerContext, initial: BackdropLayerSpec): BackdropLayer => {
  let mask: WebGLTexture | null = null;
  let disposed = false;
  let tune = tuning(initial, [1, 1, 1]);
  let channel = maskChannel(initial.params.mask ?? "water");
  const phase = new Phase();
  if (context.assets.maskUrl) void context.texture(context.assets.maskUrl).then((texture) => { if (!disposed) mask = texture; });
  return {
    kind: "shimmer", order: 10, fps: 60, usesAssets: true,
    update: (spec) => { tune = tuning(spec, [1, 1, 1]); channel = maskChannel(spec.params.mask ?? "water"); },
    modifyBase: (frame): BackdropBaseModifier | null => {
      const time = phase.advance(frame.dt, tune.speed);
      const strength = Math.min(1.5, tune.intensity * frame.intensity * 3);
      if ((!mask && channel !== "all") || strength <= 0.01) return null;
      const amount = (channel === "water" ? 3.2 : 1.6) * strength;
      return { ripple: { texture: channel === "all" ? null : mask, channel, amount, time } };
    },
    draw: () => undefined,
    dispose: () => { disposed = true; },
  };
};

export const DRIFT_MAX_REACH = 0.012;

export const driftCamera = (time: number, speed: number, intensity: number): BackdropCamera => {
  const t = time * speed;
  const reach = Math.min(DRIFT_MAX_REACH, 0.009 * Math.max(0, intensity));
  return { x: Math.sin(t * 0.031) * reach, y: Math.cos(t * 0.023) * reach * 0.6, zoom: 1 + reach * 2.3 + Math.sin(t * 0.017) * reach * 0.2 };
};

const drift = (_context: BackdropLayerContext, initial: BackdropLayerSpec): BackdropLayer => {
  let tune = tuning(initial, [1, 1, 1]);
  const phase = new Phase();
  let lastTime = -1, camera: BackdropCamera = { x: 0, y: 0, zoom: 1 };
  return {
    kind: "drift", order: 0, fps: 30,
    update: (spec) => { tune = tuning(spec, [1, 1, 1]); },
    adjustCamera: (base, frame) => {
      if (frame.time !== lastTime) { lastTime = frame.time; camera = driftCamera(phase.advance(frame.dt, tune.speed), 1, tune.intensity * frame.intensity); }
      return { x: base.x + camera.x, y: base.y + camera.y, zoom: base.zoom * camera.zoom };
    },
    draw: () => undefined,
    dispose: () => undefined,
  };
};

export const registerBuiltInLayers = (): Array<() => void> => [
  ...(Object.keys(PARTICLE_KINDS) as ParticleKind[]).map((kind) => registerLayer(kind, particleLayer(kind))),
  registerLayer("fog", fog),
  registerLayer("flicker", flicker),
  registerLayer("drift", drift),
  registerLayer("shimmer", shimmer),
];
