export const QUAD_VS = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

export const BASE_FS = `#version 300 es
precision mediump float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uA;
uniform sampler2D uB;
uniform vec4 uCoverA;
uniform vec4 uCoverB;
uniform float uMix;
uniform vec3 uCam;
uniform vec3 uTint;
uniform float uVignette;
vec2 camera(vec2 uv) { return (uv - 0.5) / uCam.z + 0.5 + uCam.xy; }
void main() {
  vec2 uv = camera(vUv);
  vec3 a = texture(uA, uv * uCoverA.xy + uCoverA.zw).rgb;
  vec3 b = texture(uB, uv * uCoverB.xy + uCoverB.zw).rgb;
  vec3 color = mix(b, a, uMix) * uTint;
  vec2 d = vUv - 0.5;
  color *= 1.0 - uVignette * dot(d, d) * 2.0;
  outColor = vec4(color, 1.0);
}`;

export const DIM_FS = `#version 300 es
precision mediump float;
in vec2 vUv;
out vec4 outColor;
uniform vec2 uBand;
uniform float uAmount;
uniform float uSoft;
void main() {
  float inside = smoothstep(uBand.x - uSoft, uBand.x + uSoft, vUv.x) * (1.0 - smoothstep(uBand.y - uSoft, uBand.y + uSoft, vUv.x));
  float alpha = uAmount * inside;
  outColor = vec4(0.0, 0.0, 0.0, alpha);
}`;

export const NOISE = `
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return v;
}`;

export const PARTICLE_VS = `#version 300 es
precision highp float;
uniform float uTime;
uniform float uSpeed;
uniform vec2 uRes;
uniform int uKind;
uniform float uScale;
out vec2 vLocal;
out float vAlpha;
float h(float n) { return fract(sin(n * 127.1) * 43758.5453); }
const vec2 CORNERS[6] = vec2[6](vec2(-1.0, -1.0), vec2(1.0, -1.0), vec2(1.0, 1.0), vec2(-1.0, -1.0), vec2(1.0, 1.0), vec2(-1.0, 1.0));
void main() {
  float id = float(gl_VertexID / 6);
  vec2 q = CORNERS[gl_VertexID % 6];
  float r1 = h(id + 1.0), r2 = h(id + 7.3), r3 = h(id + 13.7), r4 = h(id + 29.1);
  float t = uTime * uSpeed;
  vec2 p = vec2(0.5);
  vec2 ext = vec2(2.0);
  vec2 dir = vec2(0.0, 1.0);
  float alpha = 1.0;
  if (uKind == 0) {
    float fall = 1.4 + r3 * 0.9;
    p.y = 1.0 - fract(r2 + t * fall * 0.55);
    p.x = fract(r1 + (1.0 - p.y) * 0.06);
    dir = normalize(vec2(0.06 * uRes.y / uRes.x, 1.0));
    ext = vec2(0.6, 9.0 + r4 * 9.0) * uScale;
    alpha = 0.18 + r3 * 0.22;
  } else if (uKind == 1) {
    float fall = 0.035 + r3 * 0.05;
    p.y = 1.0 - fract(r2 + t * fall);
    p.x = fract(r1 + sin(t * 0.6 + r4 * 6.28) * 0.015 + t * 0.004);
    ext = vec2(1.0 + r4 * 2.2) * uScale;
    alpha = 0.45 + r3 * 0.4;
  } else if (uKind == 2) {
    float rise = 0.04 + r3 * 0.06;
    float life = fract(r2 + t * rise);
    p.y = life * 0.95;
    p.x = fract(r1 + sin(t * 0.9 + r4 * 6.28) * 0.02 + life * 0.05);
    ext = vec2(0.9 + r4 * 1.6) * uScale;
    alpha = (0.55 + 0.45 * sin(t * 6.0 + r4 * 40.0)) * (1.0 - life) * smoothstep(0.0, 0.1, life);
  } else if (uKind == 3) {
    p = fract(vec2(r1, r2) + vec2(sin(t * 0.07 + r3 * 6.28), cos(t * 0.05 + r4 * 6.28)) * 0.04 + t * vec2(0.003, 0.0015));
    ext = vec2(0.6 + r3 * 1.4) * uScale;
    alpha = (0.12 + 0.2 * r4) * (0.6 + 0.4 * sin(t * 0.8 + r1 * 30.0));
  } else {
    p = vec2(fract(r1 + sin(t * 0.11 + r3 * 6.28) * 0.06), 0.08 + 0.55 * fract(r2 + cos(t * 0.09 + r4 * 6.28) * 0.05));
    ext = vec2(1.6 + r3 * 1.6) * uScale;
    alpha = pow(max(0.0, sin(t * (0.6 + r4) + r1 * 40.0)), 3.0);
  }
  vec2 side = vec2(dir.y, -dir.x);
  vec2 offset = (side * q.x * ext.x + dir * q.y * ext.y) * 2.0 / uRes;
  gl_Position = vec4(p * 2.0 - 1.0 + offset, 0.0, 1.0);
  vLocal = q;
  vAlpha = alpha;
}`;

export const PARTICLE_FS = `#version 300 es
precision mediump float;
in vec2 vLocal;
in float vAlpha;
out vec4 outColor;
uniform vec3 uColor;
uniform float uIntensity;
uniform highp int uKind;
void main() {
  float a;
  if (uKind == 0) a = (1.0 - abs(vLocal.x)) * smoothstep(-1.0, 0.6, vLocal.y) * (1.0 - smoothstep(0.6, 1.0, vLocal.y));
  else { float d = length(vLocal); a = uKind == 4 ? exp(-d * d * 3.0) : smoothstep(1.0, 0.2, d); }
  a *= vAlpha * uIntensity;
  outColor = vec4(uColor * a, a);
}`;

export const FOG_FS = `#version 300 es
precision mediump float;
in vec2 vUv;
out vec4 outColor;
uniform float uTime;
uniform float uSpeed;
uniform float uIntensity;
uniform float uAspect;
uniform vec3 uColor;
${NOISE}
void main() {
  vec2 p = vec2(vUv.x * uAspect, vUv.y) * 2.2;
  float t = uTime * uSpeed * 0.02;
  float n = fbm(p + vec2(t * 3.0, t)) * 0.65 + fbm(p * 1.8 - vec2(t * 2.0, -t * 0.5)) * 0.35;
  float low = 1.0 - smoothstep(0.0, 0.85, vUv.y) * 0.7;
  float a = smoothstep(0.3, 0.85, n) * low * uIntensity * 0.75;
  outColor = vec4(uColor * a, a);
}`;

export const FLICKER_FS = `#version 300 es
precision mediump float;
in vec2 vUv;
out vec4 outColor;
uniform float uTime;
uniform float uSpeed;
uniform float uIntensity;
uniform vec3 uColor;
uniform float uFlash;
${NOISE}
void main() {
  float t = uTime * uSpeed;
  float flick = 0.55 + 0.3 * noise(vec2(t * 3.1, 0.0)) + 0.15 * noise(vec2(t * 11.0, 4.0));
  float glow = (1.0 - smoothstep(0.0, 0.9, length((vUv - vec2(0.5, 0.05)) * vec2(1.0, 1.4))));
  float a = mix(glow * flick * 0.22, flick * 0.12, uFlash) * uIntensity;
  outColor = vec4(uColor * a, 0.0);
}`;

export const SHIMMER_FS = `#version 300 es
precision mediump float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uBase;
uniform sampler2D uMask;
uniform vec4 uCover;
uniform vec3 uCam;
uniform vec3 uTint;
uniform float uTime;
uniform float uSpeed;
uniform float uIntensity;
uniform int uMode;
uniform int uHasMask;
uniform float uVignette;
vec2 camera(vec2 uv) { return (uv - 0.5) / uCam.z + 0.5 + uCam.xy; }
void main() {
  float m;
  if (uHasMask == 1) { vec4 mask = texture(uMask, vUv); m = uMode == 0 ? mask.r : uMode == 1 ? mask.g : 1.0; }
  else m = uMode == 0 ? smoothstep(0.55, 0.8, vUv.y) : uMode == 1 ? 1.0 - smoothstep(0.2, 0.42, vUv.y) : 1.0;
  float t = uTime * uSpeed;
  vec2 warp = vec2(sin(vUv.y * 90.0 + t * 2.2) + sin(vUv.y * 37.0 - t * 1.3), cos(vUv.x * 60.0 + t * 1.7)) * 0.0015 * uIntensity;
  vec2 uv = camera(vUv + warp * m);
  vec3 color = texture(uBase, uv * uCover.xy + uCover.zw).rgb * uTint;
  vec2 d = vUv - 0.5;
  color *= 1.0 - uVignette * dot(d, d) * 2.0;
  float a = m * clamp(uIntensity * 1.5, 0.0, 1.0);
  outColor = vec4(color * a, a);
}`;
