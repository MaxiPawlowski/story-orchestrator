import type { BackdropFrame, BackdropLayer, BackdropLayerContext, BackdropLayerSpec } from "../types";
import { cameraOffset, clampStrength, easeToward, fogDensity, overscan, PARALLAX, PARALLAX_FRAGMENT, DEPTH_FOG_FRAGMENT, type Vec2 } from "./parallax";

export const PARALLAX_ORDER = -100;
export const DEPTH_FOG_ORDER = 50;

const num = (spec: BackdropLayerSpec, key: string, fallback: number): number => {
  const value = spec.params[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
};

export function parallaxLayer(context: BackdropLayerContext, spec: BackdropLayerSpec): BackdropLayer {
  const { gl } = context;
  const program = context.program(context.vertexShader, PARALLAX_PROGRAM);
  let depth: WebGLTexture | null = null;
  let disposed = false;
  let current: Vec2 = { x: 0, y: 0 };
  let strength = clampStrength(num(spec, "strength", PARALLAX.strength));
  const depthUrl = context.assets.depthUrl;
  if (depthUrl) void context.texture(depthUrl).then((texture) => { if (!disposed) depth = texture; });
  const uniform = (name: string) => gl.getUniformLocation(program, name);
  return {
    kind: "parallax",
    order: PARALLAX_ORDER,
    replacesBase: true,
    update(next) { strength = clampStrength(num(next, "strength", PARALLAX.strength)); },
    draw(frame: BackdropFrame) {
      const base = context.baseTexture();
      if (!base) return;
      const motion = frame.reducedMotion ? 0 : frame.intensity;
      const target = cameraOffset(frame.time, frame.pointer, { ...PARALLAX, strength }, motion);
      current = easeToward(current, target, frame.dt);
      gl.useProgram(program);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, base);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, depth ?? base);
      gl.uniform1i(uniform("u_base"), 0);
      gl.uniform1i(uniform("u_depth"), 1);
      gl.uniform1f(uniform("u_hasDepth"), depth ? 1 : 0);
      gl.uniform2f(uniform("u_offset"), current.x, current.y);
      gl.uniform1f(uniform("u_scale"), overscan(strength));
      gl.uniform1f(uniform("u_focus"), PARALLAX.focus);
      gl.uniform4fv(uniform("u_cover"), context.coverTransform());
      context.drawQuad();
    },
    dispose() { disposed = true; },
  };
}

export function depthFogLayer(context: BackdropLayerContext, spec: BackdropLayerSpec): BackdropLayer {
  const { gl } = context;
  const program = context.program(context.vertexShader, FOG_PROGRAM);
  let depth: WebGLTexture | null = null;
  let disposed = false;
  let color = [0.75, 0.78, 0.82];
  const read = (next: BackdropLayerSpec) => { const tint = next.params.color; if (typeof tint === "string") color = hexColor(tint) ?? color; };
  read(spec);
  if (context.assets.depthUrl) void context.texture(context.assets.depthUrl).then((texture) => { if (!disposed) depth = texture; });
  const uniform = (name: string) => gl.getUniformLocation(program, name);
  return {
    kind: "depthFog",
    order: DEPTH_FOG_ORDER,
    update: read,
    draw(frame: BackdropFrame) {
      if (!depth) return;
      const density = fogDensity(frame.state, frame.intensity) * num(spec, "density", 1);
      if (density <= 0) return;
      gl.useProgram(program);
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, depth);
      gl.uniform1i(uniform("u_depth"), 1);
      gl.uniform3f(uniform("u_fogColor"), color[0], color[1], color[2]);
      gl.uniform1f(uniform("u_density"), density);
      gl.uniform1f(uniform("u_time"), frame.reducedMotion ? 0 : frame.time);
      gl.uniform4fv(uniform("u_cover"), context.coverTransform());
      context.drawQuad();
    },
    dispose() { disposed = true; },
  };
}

export function hexColor(value: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return null;
  const int = parseInt(match[1], 16);
  return [((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255];
}

const PARALLAX_PROGRAM = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform vec4 u_cover;
uniform float u_hasDepth;
${PARALLAX_FRAGMENT}
void main() {
  vec2 uv = v_uv * u_cover.xy + u_cover.zw;
  outColor = texture(u_base, u_hasDepth > 0.5 ? so_parallax_uv(uv) : uv);
}
`;

const FOG_PROGRAM = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform vec4 u_cover;
${DEPTH_FOG_FRAGMENT}
void main() {
  vec2 uv = v_uv * u_cover.xy + u_cover.zw;
  outColor = so_depth_fog_overlay(uv);
}
`;
