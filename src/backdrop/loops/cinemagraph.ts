import type { BackdropAutoInput, BackdropFrame, BackdropLayer, BackdropLayerContext, BackdropLayerSpec } from "../types";

export const CINEMAGRAPH_KIND = "cinemagraph";
export const CINEMAGRAPH_ORDER = -90;
export const CINEMAGRAPH_PERIOD_S = 8;

export const CINEMAGRAPH_FLOW = Object.freeze({ skyDrift: 0.016, skyWobble: 0.006, rippleAmp: 0.0035, rippleFreq: 150, rippleCycles: 2, rippleFar: 0.35 });

const glsl = (value: number): string => (Number.isInteger(value) ? `${value}.0` : String(value));

export const CINEMAGRAPH_FRAGMENT = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_base;
uniform sampler2D u_mask;
uniform vec4 u_cover;
uniform vec3 u_cam;
uniform vec3 u_tint;
uniform float u_vignette;
uniform float u_time;
uniform float u_strength;
uniform float u_period;
const float TAU = 6.28318530718;
float so_cg_hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float so_cg_noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(so_cg_hash(i), so_cg_hash(i + vec2(1.0, 0.0)), u.x), mix(so_cg_hash(i + vec2(0.0, 1.0)), so_cg_hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
vec3 so_cg_take(vec2 from, vec3 still, float sky) {
  vec4 region = texture(u_mask, from);
  return mix(still, texture(u_base, from).rgb, mix(region.g, region.r, sky));
}
void main() {
  vec2 screen = (v_uv - 0.5) / u_cam.z + 0.5 + u_cam.xy;
  vec2 uv = screen * u_cover.xy + u_cover.zw;
  vec4 mask = texture(u_mask, uv);
  float sky = mask.r;
  float water = mask.g;
  float amount = max(sky, water) * u_strength;
  if (amount < 0.004) discard;
  vec3 still = texture(u_base, uv).rgb;
  vec3 color;
  if (sky >= water) {
    vec2 wobble = vec2(so_cg_noise(uv * 4.0), so_cg_noise(uv * 4.0 + 17.3)) - 0.5;
    vec2 flow = vec2(${glsl(CINEMAGRAPH_FLOW.skyDrift)}, 0.0) + wobble * ${glsl(CINEMAGRAPH_FLOW.skyWobble)};
    float phase0 = fract(u_time / u_period);
    float phase1 = fract(u_time / u_period + 0.5);
    float weight = 1.0 - abs(1.0 - 2.0 * phase0);
    color = so_cg_take(uv - flow * (phase0 - 0.5), still, 1.0) * weight + so_cg_take(uv - flow * (phase1 - 0.5), still, 1.0) * (1.0 - weight);
  } else {
    float near = 1.0 - uv.y;
    float amp = ${glsl(CINEMAGRAPH_FLOW.rippleAmp)} * mix(${glsl(CINEMAGRAPH_FLOW.rippleFar)}, 1.0, near);
    float wave = sin(uv.y * ${glsl(CINEMAGRAPH_FLOW.rippleFreq)} * (2.0 - near) + TAU * ${glsl(CINEMAGRAPH_FLOW.rippleCycles)} * u_time / u_period
      + so_cg_noise(vec2(uv.x * 6.0, uv.y * 40.0)) * TAU);
    color = so_cg_take(uv + vec2(wave * amp, 0.0), still, 0.0);
  }
  vec2 edge = v_uv - 0.5;
  color *= u_tint * (1.0 - u_vignette * dot(edge, edge) * 2.0);
  float alpha = clamp(amount, 0.0, 1.0);
  outColor = vec4(color * alpha, alpha);
}
`;

export const cinemagraphWeight = (frame: Pick<BackdropFrame, "reducedMotion" | "intensity">): number =>
  frame.reducedMotion ? 0 : Math.min(1, Math.max(0, 0.6 + frame.intensity * 0.4));

export const cinemagraphVignette = (frame: Pick<BackdropFrame, "state">): number => 0.12 + frame.state.tension * 0.25;

export function cinemagraphAuto(input: BackdropAutoInput): BackdropLayerSpec | null {
  const tier = input.settings.loops;
  const maskUrl = input.assets.maskUrl;
  if (tier === "off" || !input.base || input.base.kind !== "image" || !maskUrl || input.assets.loopUrl) return null;
  return { id: `${CINEMAGRAPH_KIND}:${maskUrl}`, kind: CINEMAGRAPH_KIND, params: { mask: maskUrl } };
}

export function cinemagraphLayer(context: BackdropLayerContext, spec?: BackdropLayerSpec): BackdropLayer {
  const { gl } = context;
  const program = context.program(context.vertexShader, CINEMAGRAPH_FRAGMENT);
  const uniform = (name: string) => gl.getUniformLocation(program, name);
  let mask: WebGLTexture | null = null;
  let disposed = false;
  const maskUrl = typeof spec?.params.mask === "string" ? spec.params.mask : context.assets.maskUrl;
  if (maskUrl) void context.texture(maskUrl).then((texture) => { if (!disposed) mask = texture; });
  return {
    kind: CINEMAGRAPH_KIND,
    order: CINEMAGRAPH_ORDER,
    draw(frame: BackdropFrame) {
      const base = context.baseTexture();
      const strength = cinemagraphWeight(frame);
      if (!base || !mask || strength <= 0) return;
      gl.useProgram(program);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, base);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, mask);
      gl.uniform1i(uniform("u_base"), 0);
      gl.uniform1i(uniform("u_mask"), 1);
      gl.uniform4fv(uniform("u_cover"), context.coverTransform());
      gl.uniform3f(uniform("u_cam"), frame.camera.x, frame.camera.y, frame.camera.zoom || 1);
      gl.uniform3fv(uniform("u_tint"), frame.tint);
      gl.uniform1f(uniform("u_vignette"), cinemagraphVignette(frame));
      gl.uniform1f(uniform("u_time"), frame.time / 1000);
      gl.uniform1f(uniform("u_strength"), strength);
      gl.uniform1f(uniform("u_period"), CINEMAGRAPH_PERIOD_S);
      context.drawQuad();
      gl.activeTexture(gl.TEXTURE0);
    },
    dispose() { disposed = true; },
  };
}
