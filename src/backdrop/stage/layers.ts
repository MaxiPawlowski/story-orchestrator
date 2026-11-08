import type { BackdropCamera, BackdropFrame, BackdropLayer, BackdropLayerContext, BackdropLayerSpec } from "../types";
import { registerLayer } from "./registry";
import { FLICKER_FS, FOG_FS, PARTICLE_FS, PARTICLE_VS, QUAD_VS, SHIMMER_FS } from "./shaders";

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

interface Tuning { intensity: number; speed: number; color: [number, number, number] }

const tuning = (spec: BackdropLayerSpec, color: [number, number, number]): Tuning =>
  ({ intensity: numberParam(spec, "intensity", 0.6), speed: numberParam(spec, "speed", 1), color: hexColor(spec.params.color, color) });

export const PARTICLE_KINDS = { rain: 0, snow: 1, embers: 2, dust: 3, fireflies: 4 } as const;
type ParticleKind = keyof typeof PARTICLE_KINDS;

const PARTICLE_DEFAULTS: Record<ParticleKind, { count: number; color: [number, number, number]; order: number }> = {
  rain: { count: 900, color: [0.78, 0.84, 0.95], order: 20 },
  snow: { count: 520, color: [0.96, 0.97, 1], order: 20 },
  embers: { count: 110, color: [1, 0.55, 0.18], order: 22 },
  dust: { count: 160, color: [1, 0.93, 0.78], order: 24 },
  fireflies: { count: 46, color: [0.85, 1, 0.45], order: 24 },
};

export const particleCount = (kind: ParticleKind, intensity: number, width: number, height: number): number =>
  Math.max(1, Math.round(PARTICLE_DEFAULTS[kind].count * Math.max(0.15, intensity) * Math.min(1.6, Math.max(0.4, (width * height) / (1920 * 1080)))));

const particleLayer = (kind: ParticleKind) => (context: BackdropLayerContext, initial: BackdropLayerSpec): BackdropLayer => {
  const gl = context.gl;
  const program = context.program(PARTICLE_VS, PARTICLE_FS);
  const vao = gl.createVertexArray();
  let tune = tuning(initial, PARTICLE_DEFAULTS[kind].color);
  const at = (name: string) => gl.getUniformLocation(program, name);
  const u = { time: at("uTime"), speed: at("uSpeed"), res: at("uRes"), kind: at("uKind"), scale: at("uScale"), color: at("uColor"), intensity: at("uIntensity") };
  return {
    kind, order: PARTICLE_DEFAULTS[kind].order,
    update: (spec) => { tune = tuning(spec, PARTICLE_DEFAULTS[kind].color); },
    draw: (frame: BackdropFrame) => {
      const amount = tune.intensity * frame.intensity;
      if (amount <= 0.01) return;
      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.uniform1f(u.time, frame.time / 1000);
      gl.uniform1f(u.speed, tune.speed * (1 + 0.5 * frame.state.tension));
      gl.uniform2f(u.res, frame.width, frame.height);
      gl.uniform1i(u.kind, PARTICLE_KINDS[kind]);
      gl.uniform1f(u.scale, frame.dpr);
      gl.uniform3fv(u.color, tune.color.map((channel, index) => channel * (kind === "rain" || kind === "snow" ? frame.tint[index] : 1)));
      gl.uniform1f(u.intensity, Math.min(1, 0.5 + amount));
      gl.drawArrays(gl.TRIANGLES, 0, particleCount(kind, amount, frame.width / frame.dpr, frame.height / frame.dpr) * 6);
    },
    dispose: () => { gl.deleteVertexArray(vao); },
  };
};

type LayerSetup = (gl: WebGL2RenderingContext, program: WebGLProgram, frame: BackdropFrame, tune: Tuning) => void;

const fullscreenLayer = (kind: string, fragment: string, order: number, color: [number, number, number], setup?: LayerSetup) =>
  (context: BackdropLayerContext, initial: BackdropLayerSpec): BackdropLayer => {
    const gl = context.gl;
    const program = context.program(QUAD_VS, fragment);
    let tune = tuning(initial, color);
    const at = (name: string) => gl.getUniformLocation(program, name);
    const u = { time: at("uTime"), speed: at("uSpeed"), intensity: at("uIntensity"), color: at("uColor"), aspect: at("uAspect") };
    return {
      kind, order,
      update: (spec) => { tune = tuning(spec, color); },
      draw: (frame) => {
        const amount = tune.intensity * frame.intensity;
        if (amount <= 0.01) return;
        gl.useProgram(program);
        gl.uniform1f(u.time, frame.time / 1000);
        gl.uniform1f(u.speed, tune.speed);
        gl.uniform1f(u.intensity, amount);
        gl.uniform3fv(u.color, tune.color.map((channel, index) => channel * frame.tint[index]));
        gl.uniform1f(u.aspect, frame.width / Math.max(1, frame.height));
        setup?.(gl, program, frame, tune);
        context.drawQuad();
      },
      dispose: () => undefined,
    };
  };

const flicker = (context: BackdropLayerContext, initial: BackdropLayerSpec): BackdropLayer => {
  const storm = /^#?c8d8ff$/i.test(String(initial.params.color ?? ""));
  let flash = 0, next = 0;
  return fullscreenLayer("flicker", FLICKER_FS, 30, [1, 0.69, 0.38], (gl, program, frame) => {
    if (storm) {
      if (frame.time > next) { flash = 1; next = frame.time + 6000 + ((frame.time * 7919) % 9000); }
      flash = Math.max(0, flash - frame.dt / 220);
    }
    gl.uniform1f(gl.getUniformLocation(program, "uFlash"), storm ? flash : 0);
  })(context, initial);
};

const shimmer = (context: BackdropLayerContext, initial: BackdropLayerSpec): BackdropLayer => {
  let mask: WebGLTexture | null = null;
  let mode = String(initial.params.mask ?? "water");
  if (context.assets.maskUrl) void context.texture(context.assets.maskUrl).then((texture) => { mask = texture; });
  const layer = fullscreenLayer("shimmer", SHIMMER_FS, 10, [1, 1, 1], (gl, program, frame) => {
    const base = context.baseTexture();
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, base);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, mask ?? base);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(gl.getUniformLocation(program, "uBase"), 2);
    gl.uniform1i(gl.getUniformLocation(program, "uMask"), 3);
    gl.uniform1i(gl.getUniformLocation(program, "uHasMask"), mask ? 1 : 0);
    gl.uniform1i(gl.getUniformLocation(program, "uMode"), mode === "sky" ? 0 : mode === "water" ? 1 : 2);
    gl.uniform4fv(gl.getUniformLocation(program, "uCover"), context.coverTransform());
    gl.uniform3f(gl.getUniformLocation(program, "uCam"), frame.camera.x, frame.camera.y, frame.camera.zoom);
    gl.uniform3fv(gl.getUniformLocation(program, "uTint"), frame.tint);
    gl.uniform1f(gl.getUniformLocation(program, "uVignette"), 0.12 + frame.state.tension * 0.25);
  })(context, initial);
  return { ...layer, update: (spec) => { mode = String(spec.params.mask ?? "water"); layer.update?.(spec); } };
};

export const driftCamera = (time: number, speed: number, intensity: number): BackdropCamera => {
  const t = (time / 1000) * speed;
  const reach = 0.006 + 0.01 * intensity;
  return { x: Math.sin(t * 0.031) * reach, y: Math.cos(t * 0.023) * reach * 0.6, zoom: 1 + reach * 2.6 + Math.sin(t * 0.017) * reach * 0.5 };
};

const drift = (_context: BackdropLayerContext, initial: BackdropLayerSpec): BackdropLayer => {
  let tune = tuning(initial, [1, 1, 1]);
  return {
    kind: "drift", order: 0,
    update: (spec) => { tune = tuning(spec, [1, 1, 1]); },
    adjustCamera: (camera, frame) => {
      const move = driftCamera(frame.time, tune.speed, tune.intensity * frame.intensity);
      return { x: camera.x + move.x, y: camera.y + move.y, zoom: camera.zoom * move.zoom };
    },
    draw: () => undefined,
    dispose: () => undefined,
  };
};

export const BUILT_IN_LAYERS = ["rain", "snow", "embers", "dust", "fireflies", "fog", "flicker", "drift", "shimmer"] as const;

export const registerBuiltInLayers = (): Array<() => void> => [
  ...(Object.keys(PARTICLE_KINDS) as ParticleKind[]).map((kind) => registerLayer(kind, particleLayer(kind))),
  registerLayer("fog", fullscreenLayer("fog", FOG_FS, 26, [0.82, 0.85, 0.9])),
  registerLayer("flicker", flicker),
  registerLayer("drift", drift),
  registerLayer("shimmer", shimmer),
];
