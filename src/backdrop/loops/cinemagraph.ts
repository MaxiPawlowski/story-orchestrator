import type { BackdropAutoInput, BackdropFrame, BackdropLayer, BackdropLayerContext, BackdropLayerSpec } from "../types";

export const CINEMAGRAPH_KIND = "cinemagraph";
export const CINEMAGRAPH_ORDER = -90;
export const CINEMAGRAPH_PERIOD_S = 8;

export const CINEMAGRAPH_FRAGMENT = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_base;
uniform sampler2D u_mask;
uniform vec4 u_cover;
uniform float u_time;
uniform float u_strength;
uniform float u_period;
float so_cg_hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float so_cg_noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(so_cg_hash(i), so_cg_hash(i + vec2(1.0, 0.0)), u.x), mix(so_cg_hash(i + vec2(0.0, 1.0)), so_cg_hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
vec2 so_cg_flow(vec2 uv, float sky, float water) {
  vec2 wobble = vec2(so_cg_noise(uv * 4.0), so_cg_noise(uv * 4.0 + 17.3)) - 0.5;
  return sky * (vec2(0.030, 0.0) + wobble * 0.012) + water * (vec2(0.010, 0.0) + wobble * 0.006);
}
void main() {
  vec2 uv = v_uv * u_cover.xy + u_cover.zw;
  vec4 mask = texture(u_mask, uv);
  float sky = mask.r;
  float water = mask.g;
  float amount = max(sky, water) * u_strength;
  if (amount < 0.004) discard;
  vec2 flow = so_cg_flow(uv, sky, water);
  float phase0 = fract(u_time / u_period);
  float phase1 = fract(u_time / u_period + 0.5);
  float weight = 1.0 - abs(1.0 - 2.0 * phase0);
  vec2 ripple = vec2(0.0, sin(uv.x * 90.0 + u_time * 1.7) * 0.0012 * water);
  vec2 uv0 = clamp(uv - flow * (phase0 - 0.5) + ripple, vec2(0.0), vec2(1.0));
  vec2 uv1 = clamp(uv - flow * (phase1 - 0.5) + ripple, vec2(0.0), vec2(1.0));
  vec3 color = texture(u_base, uv0).rgb * weight + texture(u_base, uv1).rgb * (1.0 - weight);
  outColor = vec4(color, clamp(amount, 0.0, 1.0));
}
`;

export const cinemagraphWeight = (frame: Pick<BackdropFrame, "reducedMotion" | "intensity">): number =>
  frame.reducedMotion ? 0 : Math.min(1, Math.max(0, 0.6 + frame.intensity * 0.4));

export function cinemagraphAuto(input: BackdropAutoInput): BackdropLayerSpec | null {
  const tier = input.settings.loops;
  if (tier === "off" || !input.base || input.base.kind !== "image" || !input.assets.maskUrl || input.assets.loopUrl) return null;
  return { id: CINEMAGRAPH_KIND, kind: CINEMAGRAPH_KIND, params: {} };
}

export function cinemagraphLayer(context: BackdropLayerContext): BackdropLayer {
  const { gl } = context;
  const program = context.program(context.vertexShader, CINEMAGRAPH_FRAGMENT);
  const uniform = (name: string) => gl.getUniformLocation(program, name);
  let mask: WebGLTexture | null = null;
  let disposed = false;
  const maskUrl = context.assets.maskUrl;
  if (maskUrl) void context.texture(maskUrl).then((texture) => { if (!disposed) mask = texture; });
  return {
    kind: CINEMAGRAPH_KIND,
    order: CINEMAGRAPH_ORDER,
    draw(frame: BackdropFrame) {
      const base = context.baseTexture();
      const strength = cinemagraphWeight(frame);
      if (!base || !mask || strength <= 0) return;
      gl.useProgram(program);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, base);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, mask);
      gl.uniform1i(uniform("u_base"), 0);
      gl.uniform1i(uniform("u_mask"), 1);
      gl.uniform4fv(uniform("u_cover"), context.coverTransform());
      gl.uniform1f(uniform("u_time"), frame.time);
      gl.uniform1f(uniform("u_strength"), strength);
      gl.uniform1f(uniform("u_period"), CINEMAGRAPH_PERIOD_S);
      context.drawQuad();
    },
    dispose() { disposed = true; },
  };
}
