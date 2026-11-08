export interface ParallaxParams { strength: number; drift: number; tilt: number; focus: number; periodS: number; steps: number }
export interface Vec2 { x: number; y: number }

export const PARALLAX: ParallaxParams = Object.freeze({ strength: 0.018, drift: 0.55, tilt: 1, focus: 0.35, periodS: 38, steps: 12 });
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

export const PARALLAX_FRAGMENT = `
uniform sampler2D u_base;
uniform sampler2D u_depth;
uniform vec2 u_offset;
uniform float u_scale;
uniform float u_focus;
const int STEPS = 12;
vec2 so_parallax_uv(vec2 uv) {
  vec2 centered = vec2(0.5) + (uv - vec2(0.5)) / u_scale;
  vec2 shift = u_offset / u_scale;
  vec2 hit = centered + shift * (texture(u_depth, centered).r - u_focus);
  float layer = 1.0;
  float stepSize = 1.0 / float(STEPS);
  for (int i = 0; i < STEPS; i++) {
    vec2 probe = centered + shift * (layer - u_focus);
    if (texture(u_depth, probe).r >= layer) { hit = probe; break; }
    layer -= stepSize;
  }
  return clamp(hit, vec2(0.0), vec2(1.0));
}
`;

export const DEPTH_FOG_FRAGMENT = `
uniform sampler2D u_depth;
uniform vec3 u_fogColor;
uniform float u_density;
uniform float u_time;
float so_fog_noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = fract(sin(dot(i, vec2(12.9898, 78.233))) * 43758.5453);
  float b = fract(sin(dot(i + vec2(1.0, 0.0), vec2(12.9898, 78.233))) * 43758.5453);
  float c = fract(sin(dot(i + vec2(0.0, 1.0), vec2(12.9898, 78.233))) * 43758.5453);
  float d = fract(sin(dot(i + vec2(1.0, 1.0), vec2(12.9898, 78.233))) * 43758.5453);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
vec4 so_depth_fog_overlay(vec2 uv) {
  float far = 1.0 - texture(u_depth, uv).r;
  float drift = so_fog_noise(uv * 3.0 + vec2(u_time * 0.015, u_time * 0.004)) * 0.6 + so_fog_noise(uv * 7.0 - vec2(u_time * 0.01, 0.0)) * 0.4;
  float amount = clamp(far * far * u_density * (0.65 + 0.7 * drift), 0.0, 0.85);
  return vec4(u_fogColor, amount);
}
`;

export function fogDensity(state: { weather?: string | null; timeOfDay?: string | null; indoor?: boolean }, intensity: number): number {
  const base = state.weather === "fog" || state.weather === "mist" ? 0.9 : state.weather === "rain" || state.weather === "snow" ? 0.5 : 0.28;
  const indoor = state.indoor ? 0.4 : 1;
  const night = state.timeOfDay === "night" ? 1.15 : state.timeOfDay === "dawn" || state.timeOfDay === "morning" ? 1.2 : 1;
  return Math.min(1, base * indoor * night * Math.min(1, Math.max(0, intensity)));
}
