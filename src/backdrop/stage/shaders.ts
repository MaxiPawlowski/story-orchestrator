export const QUAD_VS = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

export const HASH = `
uint pcg(uint v) { uint state = v * 747796405u + 2891336453u; uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u; return (word >> 22u) ^ word; }
float rand(uint seed) { return float(pcg(seed)) / 4294967295.0; }
vec2 grad(ivec2 cell) { float angle = rand(uint(cell.x) * 1973u + uint(cell.y) * 9277u + 26699u) * 6.2831853; return vec2(cos(angle), sin(angle)); }
float gnoise(vec2 p) {
  ivec2 i = ivec2(floor(p));
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = dot(grad(i), f), b = dot(grad(i + ivec2(1, 0)), f - vec2(1.0, 0.0));
  float c = dot(grad(i + ivec2(0, 1)), f - vec2(0.0, 1.0)), d = dot(grad(i + ivec2(1, 1)), f - vec2(1.0, 1.0));
  return 0.5 + 0.7 * mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 turn = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 5; i++) { v += a * gnoise(p); p = turn * p * 2.02 + vec2(1.7, 9.2); a *= 0.5; }
  return v / 0.97;
}
float dither(vec2 frag) { return fract(52.9829189 * fract(dot(frag, vec2(0.06711056, 0.00583715)))) - 0.5; }
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 toLinear(vec3 c) { return pow(max(c, 0.0), vec3(2.2)); }
vec3 toSrgb(vec3 c) { return pow(max(c, 0.0), vec3(1.0 / 2.2)); }`;

export const SCENE = `
uniform sampler2D uScene;
uniform vec4 uSceneCover;
uniform vec3 uSceneCam;
uniform vec3 uQuiet;
float quiet(vec2 screen) { return uQuiet.z * smoothstep(uQuiet.x - 0.06, uQuiet.x + 0.04, screen.x) * (1.0 - smoothstep(uQuiet.y - 0.04, uQuiet.y + 0.06, screen.x)); }
vec2 sceneUv(vec2 screen) { return ((screen - 0.5) / uSceneCam.z + 0.5 + uSceneCam.xy) * uSceneCover.xy + uSceneCover.zw; }
vec3 sceneLight(vec2 screen, float lod) { return textureLod(uScene, sceneUv(screen), lod).rgb; }`;

export const BASE_FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uA;
uniform sampler2D uB;
uniform sampler2D uDepth;
uniform sampler2D uMask;
uniform vec4 uCoverA;
uniform vec4 uCoverB;
uniform float uMix;
uniform vec3 uCam;
uniform vec3 uTint;
uniform vec3 uGrade;
uniform float uVignette;
uniform int uHasDepth;
uniform vec2 uOffset;
uniform float uScale;
uniform float uFocus;
uniform float uFog;
uniform vec3 uFogColor;
uniform float uFogTime;
uniform int uRipple;
uniform int uRippleChannel;
uniform float uRippleAmount;
uniform float uRippleTime;
uniform vec2 uPixel;
${HASH}
vec2 camera(vec2 uv) { return (uv - 0.5) / uCam.z + 0.5 + uCam.xy; }
float depthAt(vec2 uv) { return texture(uDepth, uv).r; }
vec2 parallax(vec2 uv, out float depth) {
  vec2 centered = vec2(0.5) + (uv - vec2(0.5)) / uScale;
  vec2 shift = uOffset * uCoverA.xy / uScale;
  const int STEPS = 24;
  float stepSize = 1.0 / float(STEPS);
  float layer = 1.0;
  float previous = 1.0;
  for (int i = 0; i < STEPS; i++) {
    if (depthAt(centered + shift * (layer - uFocus)) >= layer) break;
    previous = layer;
    layer -= stepSize;
  }
  float lo = max(layer, 0.0), hi = previous;
  for (int i = 0; i < 6; i++) {
    float mid = 0.5 * (lo + hi);
    if (depthAt(centered + shift * (mid - uFocus)) >= mid) lo = mid; else hi = mid;
  }
  vec2 hit = clamp(centered + shift * (lo - uFocus), vec2(0.0), vec2(1.0));
  depth = depthAt(hit);
  return hit;
}
float maskAt(vec2 uv) {
  if (uRippleChannel == 2) return 1.0;
  vec4 mask = texture(uMask, uv);
  return smoothstep(0.15, 0.65, uRippleChannel == 0 ? mask.r : mask.g);
}
vec2 ripple(vec2 uv, float amount) {
  float t = uRippleTime;
  if (uRippleChannel == 1) {
    float far = clamp(uv.y * 2.2, 0.0, 1.0);
    vec2 p = vec2(uv.x * 26.0, uv.y * 150.0) * mix(1.0, 2.2, far);
    float n = gnoise(p + vec2(t * 0.35, -t * 1.1)) + 0.6 * gnoise(p * 1.9 + vec2(-t * 0.5, -t * 1.7)) - 0.8;
    float m = gnoise(p * 0.7 + vec2(t * 0.2, t * 0.6)) - 0.5;
    return vec2(m * 0.6, n) * amount * mix(1.0, 0.45, far) * uPixel;
  }
  vec2 p = uv * vec2(3.0, 2.0);
  vec2 n = vec2(fbm(p + vec2(t * 0.025, 0.0)), fbm(p + vec2(5.2, 1.3) - vec2(t * 0.018, 0.0))) - 0.5;
  return n * amount * 2.5 * uPixel;
}
void main() {
  vec2 screen = camera(vUv);
  vec2 uv = screen * uCoverA.xy + uCoverA.zw;
  float depth = 0.0;
  if (uHasDepth == 1) uv = parallax(uv, depth);
  if (uRipple == 1) uv += ripple(uv, uRippleAmount) * maskAt(uv);
  vec3 a = toLinear(texture(uA, uv).rgb);
  if (uHasDepth == 1 && uFog > 0.0) {
    float far = 1.0 - depth;
    vec3 light = toLinear(textureLod(uA, uv, 5.0).rgb);
    float drift = fbm(uv * vec2(2.6, 4.0) + vec2(uFogTime * 0.012, uFogTime * 0.003));
    float amount = clamp(uFog * far * far * (0.55 + 0.9 * drift), 0.0, 0.8);
    a = mix(a, mix(light, toLinear(uFogColor) * max(luma(light) * 1.6, 0.004), 0.55), amount);
  }
  vec3 b = toLinear(texture(uB, screen * uCoverB.xy + uCoverB.zw).rgb);
  vec3 source = toSrgb(mix(b, a, uMix));
  vec3 color = source * uTint;
  color = mix(vec3(luma(color)), color, uGrade.x);
  color = mix(vec3(0.42 * dot(uTint, vec3(0.333))), color, uGrade.y);
  float spread = max(source.r, max(source.g, source.b)) - min(source.r, min(source.g, source.b));
  float practical = uGrade.z * smoothstep(0.55, 0.85, luma(source)) * smoothstep(0.02, 0.2, source.r - source.b) * smoothstep(0.15, 0.4, spread);
  color = mix(color, source * mix(vec3(1.0), uTint, 0.25), practical);
  vec2 d = vUv - 0.5;
  color *= 1.0 - uVignette * smoothstep(0.15, 0.75, dot(d, d) * 2.0);
  outColor = vec4(color + dither(gl_FragCoord.xy) / 255.0, 1.0);
}`;

export const DIM_FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform vec2 uBand;
uniform float uAmount;
uniform float uSoft;
${HASH}
void main() {
  float inside = smoothstep(uBand.x - 2.0 * uSoft, uBand.x, vUv.x) * (1.0 - smoothstep(uBand.y, uBand.y + 2.0 * uSoft, vUv.x));
  outColor = vec4(0.0, 0.0, 0.0, clamp(uAmount * inside + dither(gl_FragCoord.xy) / 255.0, 0.0, 1.0));
}`;

export const PARTICLE_VS = `#version 300 es
precision highp float;
uniform float uPhase;
uniform float uTime;
uniform vec2 uRes;
uniform int uKind;
uniform float uScale;
uniform float uDensity;
uniform float uWind;
uniform float uDrift;
${HASH}
${SCENE}
out vec2 vLocal;
out vec2 vSize;
out float vAlpha;
out vec3 vLight;
out float vLife;
const vec2 CORNERS[6] = vec2[6](vec2(-1.0, -1.0), vec2(1.0, -1.0), vec2(1.0, 1.0), vec2(-1.0, -1.0), vec2(1.0, 1.0), vec2(-1.0, 1.0));
float wrapped(float value, float margin) { return fract(value) * (1.0 + 2.0 * margin) - margin; }
void main() {
  uint id = uint(gl_VertexID / 6);
  vec2 q = CORNERS[gl_VertexID % 6];
  float r1 = rand(id * 5u + 1u), r2 = rand(id * 5u + 2u), r3 = rand(id * 5u + 3u), r4 = rand(id * 5u + 4u), keep = rand(id * 5u + 5u);
  float visible = clamp((uDensity - keep) * 25.0, 0.0, 1.0);
  vec2 css = uRes / uScale;
  vec2 p = vec2(0.5);
  vec2 dir = vec2(0.0, 1.0);
  vec2 ext = vec2(1.0);
  vec2 size = vec2(1.0);
  float alpha = 1.0;
  float life = 0.0;
  if (uKind == 0) {
    float z = r3 * r3;
    float speed = mix(0.75, 1.9, z);
    float margin = 0.12;
    p.y = 1.0 + margin - fract(r2 + uPhase * speed / (1.0 + 2.0 * margin)) * (1.0 + 2.0 * margin);
    vec2 velocity = vec2(0.11 * css.y * speed, -css.y * speed);
    p.x = wrapped(r1 - (p.y - 1.0) * 0.11 * css.y / css.x, 0.04);
    dir = normalize(velocity);
    float lengthPx = max(14.0 + 26.0 * z, length(velocity) / 38.0);
    ext = vec2(0.5 * mix(0.9, 2.2, z) + 1.0, 0.5 * lengthPx);
    size = vec2(0.5 * mix(0.9, 2.2, z), 0.5 * lengthPx);
    alpha = mix(0.16, 0.34, z);
  } else if (uKind == 1) {
    float z = r3 * r3;
    float radius = mix(0.6, 2.6, pow(z, 1.4));
    float speed = mix(0.035, 0.14, z);
    float margin = 0.04;
    p.y = 1.0 + margin - fract(r2 + uPhase * speed / (1.0 + 2.0 * margin)) * (1.0 + 2.0 * margin);
    float sway = sin(uPhase * mix(0.6, 1.4, r4) + r4 * 40.0) * mix(4.0, 16.0, z) / css.x;
    p.x = wrapped(r1 + uDrift * mix(0.01, 0.05, z) + sway, margin);
    float sigma = radius * mix(0.6, 1.2, z * z);
    ext = vec2(sigma * 3.0 + 1.0);
    size = vec2(sigma);
    alpha = mix(0.55, 0.8, z) * mix(1.0, 0.7, z * z);
  } else if (uKind == 2) {
    float z = r3;
    bool ambient = r4 < 0.07;
    float t = r2 + uPhase * mix(0.25, 0.5, z) / (ambient ? 3.0 : 1.0);
    float age = fract(t);
    uint ride = uint(floor(t));
    float seed = rand(id * 7u + ride * 131u + 9u);
    vec2 spawn = ambient ? vec2(seed, -0.04) : vec2(seed, 0.06 + 0.66 * rand(id * 7u + ride * 131u + 17u));
    vec3 source = sceneLight(spawn, 3.0);
    float warm = ambient ? 0.6 : smoothstep(0.3, 0.65, luma(source)) * smoothstep(0.04, 0.22, source.r - source.b);
    float sway = sin(uPhase * 1.7 + r1 * 30.0 + age * 5.0) * 0.006 + sin(uPhase * 0.53 + r2 * 20.0) * 0.01 * age;
    p = vec2(spawn.x + sway + age * (rand(id * 7u + ride * 131u + 23u) - 0.5) * 0.05, spawn.y + age * (ambient ? 0.85 : mix(0.1, 0.26, seed)));
    float core = mix(0.8, 1.7, z);
    ext = vec2(core * 12.0 + 1.0);
    size = vec2(core);
    life = age;
    alpha = 1.6 * warm * smoothstep(0.0, 0.08, age) * (1.0 - smoothstep(0.45, 1.0, age)) * (0.75 + 0.25 * sin(uTime * (5.0 + r4 * 6.0) + r1 * 40.0));
  } else if (uKind == 3) {
    float z = r3;
    vec2 wander = vec2(sin(uPhase * 0.11 + r3 * 6.28) + 0.5 * sin(uPhase * 0.29 + r1 * 17.0), cos(uPhase * 0.09 + r4 * 6.28) + 0.5 * sin(uPhase * 0.23 + r2 * 13.0)) * 0.012;
    p = vec2(wrapped(r1 + wander.x + uPhase * 0.002 + uDrift * mix(0.02, 0.07, z), 0.03), wrapped(r2 + wander.y - uPhase * 0.0015, 0.03));
    float sigma = mix(0.5, 1.2, z);
    float stretch = 1.0 + uWind * mix(2.0, 7.0, z);
    dir = vec2(1.0, 0.0);
    ext = vec2(sigma * 3.0 + 1.0, sigma * 3.0 * stretch + 1.0);
    size = vec2(sigma, stretch);
    vec3 light = sceneLight(p, 4.0);
    alpha = mix(0.35, 0.7, z) * smoothstep(0.22, 0.7, luma(light)) * (0.65 + 0.35 * sin(uTime * mix(0.4, 1.2, r4) + r1 * 30.0));
  } else {
    float z = r3;
    vec2 home = vec2(r1, 0.08 + 0.55 * r2);
    vec2 path = vec2(sin(uPhase * 0.21 + r3 * 9.0) + 0.6 * sin(uPhase * 0.53 + r4 * 13.0), cos(uPhase * 0.17 + r4 * 7.0) + 0.6 * sin(uPhase * 0.41 + r1 * 11.0)) * vec2(0.018, 0.022);
    p = vec2(wrapped(home.x + path.x, 0.02), home.y + path.y);
    float s = fract(uTime / mix(3.5, 7.5, r4) + r1 * 13.0);
    alpha = smoothstep(0.0, 0.12, s) * (1.0 - smoothstep(0.22, 0.42, s));
    float core = mix(1.1, 2.0, z);
    ext = vec2(core * 12.0 + 1.0);
    size = vec2(core);
  }
  alpha *= 1.0 - quiet(p);
  vec2 extent = ext * uScale;
  vec2 side = vec2(dir.y, -dir.x);
  vec2 offset = (side * q.x * extent.x + dir * q.y * extent.y) * 2.0 / uRes;
  gl_Position = visible <= 0.0 || alpha <= 0.0 ? vec4(2.0, 2.0, 2.0, 1.0) : vec4(p * 2.0 - 1.0 + offset, 0.0, 1.0);
  vLocal = q * extent;
  vSize = uKind == 3 ? vec2(size.x * uScale, size.y) : size * uScale;
  vAlpha = alpha * visible;
  vLife = life;
  vLight = uKind <= 1 ? sceneLight(p, 5.0) : vec3(0.0);
}`;

export const PARTICLE_FS = `#version 300 es
precision highp float;
in vec2 vLocal;
in vec2 vSize;
in float vAlpha;
in vec3 vLight;
in float vLife;
out vec4 outColor;
uniform vec3 uColor;
uniform float uIntensity;
uniform highp int uKind;
float gauss(vec2 d, float sigma) { return exp(-dot(d, d) / (2.0 * sigma * sigma)); }
void main() {
  float a;
  vec3 color = uColor;
  if (uKind == 0) {
    float width = vSize.x;
    float coverage = clamp(width + 0.5 - abs(vLocal.x), 0.0, 1.0) * min(1.0, width * 2.0);
    float along = vLocal.y / max(vSize.y, 1.0);
    a = coverage * smoothstep(-1.0, -0.8, along) * (1.0 - smoothstep(-0.55, 1.0, along));
    color = mix(vLight * 1.25 + 0.06, uColor, 0.55);
  } else if (uKind == 1) {
    float sigma = max(vSize.x, 0.75);
    a = gauss(vLocal, sigma) * min(1.0, vSize.x / 0.75);
    color = mix(vLight * 1.1 + 0.1, uColor, 0.65);
  } else if (uKind == 3) {
    float sigma = max(vSize.x, 0.75);
    a = gauss(vec2(vLocal.x, vLocal.y / vSize.y), sigma) * min(1.0, vSize.x / 0.75);
  } else {
    float core = max(vSize.x, 0.75);
    a = gauss(vLocal, core) + (uKind == 4 ? 0.4 : 0.18) * gauss(vLocal, core * 4.0);
    if (uKind == 2) color = mix(vec3(1.0, 0.22, 0.04), uColor * vec3(1.0, 1.12, 1.3), 1.0 - vLife);
  }
  a = clamp(a * vAlpha * uIntensity, 0.0, 1.0);
  outColor = uKind >= 2 ? vec4(color * a, 0.0) : vec4(color * a, a);
}`;

export const FOG_FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform float uPhase;
uniform float uIntensity;
uniform float uAspect;
uniform vec3 uColor;
${HASH}
${SCENE}
void main() {
  vec2 p = vec2(vUv.x * uAspect, vUv.y) * 1.6;
  float t = uPhase;
  vec2 warp = vec2(fbm(p * 0.8 + vec2(t * 0.011, 0.0)), fbm(p * 0.8 + vec2(3.1, 7.7) - vec2(0.0, t * 0.007))) - 0.5;
  float n = fbm(p + warp * 1.4 + vec2(t * 0.03, t * 0.004)) * 0.6 + fbm(p * 2.1 + warp + vec2(t * 0.012, 0.0)) * 0.4;
  float low = 1.0 - smoothstep(0.05, 0.9, vUv.y) * 0.75;
  float a = smoothstep(0.38, 0.82, n) * low * uIntensity * 0.7;
  vec3 light = sceneLight(vUv, 6.0);
  vec3 color = mix(light * 1.2 + 0.02, uColor * max(luma(light) * 1.5, 0.04), 0.5);
  a = clamp(a + dither(gl_FragCoord.xy) / 255.0, 0.0, 1.0);
  outColor = vec4(color * a, a);
}`;

export const FLICKER_FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform float uIntensity;
uniform vec3 uColor;
uniform float uFlash;
uniform float uFlicker;
${HASH}
${SCENE}
void main() {
  vec3 light = sceneLight(vUv, 3.0);
  float lit = pow(clamp(luma(light) * 1.4, 0.0, 1.0), 0.8);
  float f = uFlicker * uIntensity;
  vec3 add = uColor * max(f, 0.0) * lit * 0.5;
  float sky = smoothstep(0.35, 1.0, vUv.y);
  add += uColor * uFlash * (0.08 + 0.32 * lit + 0.2 * sky);
  outColor = vec4(add + dither(gl_FragCoord.xy) / 255.0, max(-f, 0.0) * lit * 0.45);
}`;
