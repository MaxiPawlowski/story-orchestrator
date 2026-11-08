export interface ParallaxParams { strength: number; drift: number; tilt: number; focus: number; periodS: number; halfLifeS: number }
export interface Vec2 { x: number; y: number }

export const PARALLAX: ParallaxParams = Object.freeze({ strength: 0.012, drift: 0.6, tilt: 0.45, focus: 0.35, periodS: 46, halfLifeS: 1.1 });
export const MAX_STRENGTH = 0.05;

export const clampStrength = (value: number): number => Math.min(MAX_STRENGTH, Math.max(0, Number.isFinite(value) ? value : 0));

export const overscan = (strength: number): number => 1 + 2 * clampStrength(strength);

export function sampleUv(uv: Vec2, offset: Vec2, depth: number, params: Pick<ParallaxParams, "strength" | "focus">): Vec2 {
  const scale = overscan(params.strength);
  const lift = depth - params.focus;
  return { x: 0.5 + (uv.x - 0.5) / scale + (offset.x * lift) / scale, y: 0.5 + (uv.y - 0.5) / scale + (offset.y * lift) / scale };
}

export function cameraOffset(timeS: number, pointer: Vec2 | null, params: ParallaxParams, intensity = 1): Vec2 {
  const strength = clampStrength(params.strength) * Math.min(1, Math.max(0, intensity));
  const phase = (2 * Math.PI * timeS) / Math.max(1, params.periodS);
  const drift = { x: Math.sin(phase) * params.drift, y: Math.sin(phase * 0.5 + 1.3) * params.drift * 0.45 };
  const tilt = pointer ? { x: clampUnit(pointer.x) * params.tilt, y: clampUnit(pointer.y) * params.tilt * 0.6 } : { x: 0, y: 0 };
  const raw = { x: drift.x + tilt.x, y: drift.y + tilt.y };
  const length = Math.hypot(raw.x, raw.y);
  const limit = length > 1 ? 1 / length : 1;
  return { x: raw.x * limit * strength, y: raw.y * limit * strength };
}

export function easeToward(current: Vec2, target: Vec2, dtS: number, halfLifeS = 0.6): Vec2 {
  const k = 1 - Math.pow(0.5, Math.max(0, dtS) / halfLifeS);
  return { x: current.x + (target.x - current.x) * k, y: current.y + (target.y - current.y) * k };
}

const clampUnit = (value: number): number => Math.min(1, Math.max(-1, Number.isFinite(value) ? value : 0));

export function fogDensity(state: { weather?: string | null; timeOfDay?: string | null; indoor?: boolean }, intensity: number): number {
  if (state.indoor) return 0;
  const base = state.weather === "fog" ? 0.75 : state.weather === "storm" ? 0.38 : state.weather === "rain" || state.weather === "snow" ? 0.3 : 0.07;
  const morning = state.timeOfDay === "dawn" ? 1.25 : 1;
  return Math.min(1, base * morning * Math.min(1, Math.max(0, intensity * 1.6)));
}
