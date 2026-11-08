import type { BackdropBaseModifier, BackdropFrame, BackdropLayer, BackdropLayerContext, BackdropLayerSpec } from "../types";
import { cameraOffset, clampStrength, easeToward, fogDensity, overscan, PARALLAX, type Vec2 } from "./parallax";

export const PARALLAX_ORDER = -100;
export const DEPTH_FOG_ORDER = -90;

const num = (spec: BackdropLayerSpec, key: string, fallback: number): number => {
  const value = spec.params[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
};

interface DepthHold { disposed: boolean; texture: WebGLTexture | null }

const loadDepth = (context: BackdropLayerContext, hold: DepthHold): void => {
  if (context.assets.depthUrl) void context.texture(context.assets.depthUrl).then((texture) => { if (!hold.disposed) hold.texture = texture; });
};

export function parallaxLayer(context: BackdropLayerContext, spec: BackdropLayerSpec): BackdropLayer {
  const depth: DepthHold = { disposed: false, texture: null };
  let current: Vec2 = { x: 0, y: 0 };
  let strength = clampStrength(num(spec, "strength", PARALLAX.strength));
  loadDepth(context, depth);
  return {
    kind: "parallax",
    order: PARALLAX_ORDER,
    fps: 60,
    usesAssets: true,
    update(next) { strength = clampStrength(num(next, "strength", PARALLAX.strength)); },
    modifyBase(frame: BackdropFrame): BackdropBaseModifier | null {
      const motion = frame.reducedMotion ? 0 : frame.intensity;
      current = easeToward(current, cameraOffset(frame.time, frame.pointer, { ...PARALLAX, strength }, motion), frame.dt, PARALLAX.halfLifeS);
      if (!depth.texture) return null;
      return { depth: { texture: depth.texture, offset: [current.x, -current.y], scale: overscan(strength * Math.min(1, motion)), focus: PARALLAX.focus } };
    },
    draw() { return undefined; },
    dispose() { depth.disposed = true; },
  };
}

export function depthFogLayer(context: BackdropLayerContext, spec: BackdropLayerSpec): BackdropLayer {
  const depth: DepthHold = { disposed: false, texture: null };
  let color: [number, number, number] = [0.75, 0.78, 0.82];
  let density = num(spec, "density", 1);
  const read = (next: BackdropLayerSpec) => { const tint = next.params.color; if (typeof tint === "string") color = hexColor(tint) ?? color; density = num(next, "density", 1); };
  read(spec);
  loadDepth(context, depth);
  return {
    kind: "depthFog",
    order: DEPTH_FOG_ORDER,
    fps: 30,
    usesAssets: true,
    update: read,
    modifyBase(frame: BackdropFrame): BackdropBaseModifier | null {
      const amount = fogDensity(frame.state, frame.intensity) * density;
      if (!depth.texture || amount <= 0) return null;
      return { fog: { texture: depth.texture, density: amount, color: [color[0] * frame.tint[0], color[1] * frame.tint[1], color[2] * frame.tint[2]], time: frame.reducedMotion ? 0 : frame.time } };
    },
    draw() { return undefined; },
    dispose() { depth.disposed = true; },
  };
}

export function hexColor(value: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return null;
  const int = parseInt(match[1], 16);
  return [((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255];
}
