/*! Adapted from mesh-avatar-studio 6f6d362.
MIT License

Copyright (c) 2026 Yuki Shindo

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
export const VS = `#version 300 es
in vec2 aPos; in vec2 aUv;
uniform vec2 uScale; uniform vec2 uOffset;
out vec2 vUv;
void main() { vUv = aUv; gl_Position = vec4(aPos * uScale + uOffset, 0.0, 1.0); }`;
export const FS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 outColor;
uniform sampler2D uTex;
uniform vec4 uRect;
uniform int uFace;
uniform float uAlpha;
uniform vec4 uEyeBox[2];
uniform float uEyeTop[48];
uniform float uEyeBot[48];
uniform vec4 uEyeState[2];
uniform vec4 uSclera[2];
uniform vec4 uIris[2];
uniform vec4 uMouth;
uniform vec4 uMouthState;
uniform vec4 uCheeks;
uniform float uCheek;

const int EYE_N = 24;
float crv(int e, bool top, float u) {
  float f = clamp(u, 0.0, 1.0) * float(EYE_N - 1);
  int i = min(int(floor(f)), EYE_N - 2);
  float t = f - float(i);
  int k = e * EYE_N + i;
  return top ? mix(uEyeTop[k], uEyeTop[k + 1], t) : mix(uEyeBot[k], uEyeBot[k + 1], t);
}




vec2 eyeLidsRaw(int e, float u) {
  u = clamp(u, 0.0, 1.0);
  vec4 st = uEyeState[e];
  float top = crv(e, true, u), bot = crv(e, false, u);
  float b = 1.0 - st.x, smile = st.y, hump = 4.0 * u * (1.0 - u);
  float H = crv(e, false, 0.5) - crv(e, true, 0.5);
  float arc = mix(uEyeTop[e * EYE_N], uEyeTop[e * EYE_N + EYE_N - 1], u) - 0.3 * H * hump;
  float closed = max(top, bot + 1.0 + (arc - bot - 1.0) * smile);
  return vec2((closed - top) * max(b, -0.07), b > 0.0 ? (closed - bot) * b * smile : 0.0);
}

vec2 eyeLids(int e, float u, float top, float bot) {
  vec4 box = uEyeBox[e];
  float du = 5.0 / (box.y - box.x);
  vec2 raw = eyeLidsRaw(e, u);
  vec2 d = (eyeLidsRaw(e, u - 2.0 * du) + 2.0 * eyeLidsRaw(e, u - du) + 3.0 * raw
          + 2.0 * eyeLidsRaw(e, u + du) + eyeLidsRaw(e, u + 2.0 * du)) / 9.0;


  return vec2(top + max(d.x, raw.x), bot + min(d.y, raw.y));
}

vec4 texAt(vec2 p) { return texture(uTex, (p - uRect.xy) / uRect.zw); }



float irisWeight(vec4 c, vec3 tone) {
  if (c.a < 0.004) return 0.0;
  return smoothstep(0.1, 0.26, distance(c.rgb / c.a, tone)) * smoothstep(0.25, 0.75, c.a);
}

float interior(float y, float top, float bot) { return smoothstep(0.5, 2.5, y - top) * smoothstep(0.5, 2.5, bot - y); }

float trust(vec2 q, float top, float bot, vec3 tone) {
  float inside = interior(q.y, top, bot);
  if (inside >= 1.0) return 1.0;
  float inward = q.y + (q.y - top < bot - q.y ? 2.5 : -2.5);
  return max(inside, irisWeight(texAt(vec2(q.x, inward)), tone) * interior(inward, top, bot));
}

float spanWeight(int e, float x) {
  vec4 s = uIris[e];
  if (s.z < 0.5) return 1.0;
  return 1.0 - smoothstep(s.y + 1.0, s.y + 2.5, abs(x - s.x));
}

float openAt(int e, float x) {
  vec4 box = uEyeBox[e];
  float u = clamp((x - box.x) / (box.y - box.x), 0.0, 1.0);
  return crv(e, false, u) - crv(e, true, u);
}

vec3 bandFill(int e, vec2 p, float top, float bot, vec3 tone) {
  vec4 s = uIris[e]; vec4 box = uEyeBox[e];
  if (s.z < 0.5 || interior(p.y, top, bot) >= 1.0) return tone;
  float near = p.x < s.x ? -1.0 : 1.0;
  float xn = s.x + near * (s.y + 3.0), xf = s.x - near * (s.y + 3.0);
  float xe = openAt(e, xf) > openAt(e, xn) ? xf : xn;
  float ue = clamp((xe - box.x) / (box.y - box.x), 0.0, 1.0);
  vec4 edge = texAt(vec2(xe, p.y - top < bot - p.y ? crv(e, true, ue) + (p.y - top) : crv(e, false, ue) - (bot - p.y)));
  return edge.a < 0.5 ? tone : edge.rgb / edge.a;
}

vec4 slideBall(vec4 here, vec4 moved, vec3 tone, float inHere, float inMoved, vec3 fill) {
  vec3 h = here.rgb / max(here.a, 1e-4), m = moved.rgb / max(moved.a, 1e-4);
  vec3 rgb = h - irisWeight(here, tone) * inHere * (h - fill) + irisWeight(moved, tone) * inMoved * (m - fill);
  return vec4(clamp(rgb, 0.0, 1.0) * here.a, here.a);
}

vec4 eyeBall(int e, vec2 p) {
  vec4 box = uEyeBox[e]; vec4 st = uEyeState[e];
  float u = clamp((p.x - box.x) / (box.y - box.x), 0.0, 1.0);
  float top = crv(e, true, u), bot = crv(e, false, u);
  vec2 lids = eyeLids(e, u, top, bot);
  float v = clamp((p.y - top) / max(bot - top, 1.0), 0.0, 1.0);
  float w = sqrt(4.0 * u * (1.0 - u)) * sqrt(4.0 * v * (1.0 - v));
  vec2 off = vec2(st.z, st.w);
  vec4 tone = uSclera[e];
  vec4 c;
  if (tone.w < 0.5 || (off.x == 0.0 && off.y == 0.0)) c = texAt(p - off * w);
  else {
    vec2 q = p - off;
    float uq = clamp((q.x - box.x) / (box.y - box.x), 0.0, 1.0);
    vec4 here = texAt(p);
    float held = spanWeight(e, p.x);
    vec3 fill = mix(tone.rgb, bandFill(e, p, top, bot, tone.rgb), held);
    float kept = min(1.0, (1.0 - held) * irisWeight(here, tone.rgb) + held * irisWeight(vec4(fill, 1.0), tone.rgb));
    float inMoved = trust(q, crv(e, true, uq), crv(e, false, uq), tone.rgb) * spanWeight(e, q.x) * (1.0 - kept);
    c = slideBall(here, texAt(q), tone.rgb, trust(p, top, bot, tone.rgb) * held, inMoved, fill);
  }

  return c * smoothstep(lids.x - 1.0, lids.x + 0.5, p.y) * (1.0 - smoothstep(lids.y - 0.9, lids.y + 0.6, p.y));
}

vec4 mouth(vec2 p, vec4 base) {
  float open = uMouthState.x;
  if (open < 0.01) return base;
  vec2 d = vec2(cos(uMouth.z), sin(uMouth.z)), n = vec2(-d.y, d.x);
  vec2 r = p - uMouth.xy;
  float s = dot(r, d) / uMouth.w, t = dot(r, n);
  float form = uMouthState.y;
  float wf = mix(0.78, 0.46, clamp(form * 0.5 + 0.5, 0.0, 1.0));
  float k = 1.0 - (s / wf) * (s / wf);
  if (k <= 0.0) return base;
  float line = uMouthState.z * (1.0 - s * s);
  float hk = pow(k, mix(0.55, 0.85, clamp(form, 0.0, 1.0)));
  float H = mix(0.7692, 1.0, clamp(form, 0.0, 1.0)) * uMouthState.w;
  float up = line - 0.6 - open * 2.5 * hk;
  float lo = line + open * H * hk;
  float cov = smoothstep(-0.7, 0.7, t - up) * smoothstep(-0.7, 0.7, lo - t);
  if (cov <= 0.0) return base;
  float tv = clamp((t - up) / max(lo - up, 1.0), 0.0, 1.0);
  vec3 col = mix(vec3(0.24, 0.05, 0.08), vec3(0.48, 0.15, 0.19), tv);
  float tongue = smoothstep(0.5, 0.78, tv) * (1.0 - smoothstep(0.45, 0.8, abs(s) / wf));
  col = mix(col, vec3(0.86, 0.44, 0.47), tongue * 0.9);
  float teeth = (1.0 - smoothstep(0.12, 0.22, tv)) * smoothstep(0.25, 0.45, open) * (1.0 - smoothstep(0.55, 0.85, abs(s) / wf));
  col = mix(col, vec3(0.99, 0.96, 0.94), teeth);
  float rim = 1.0 - smoothstep(0.6, 1.8, lo - t);
  col = mix(col, vec3(0.36, 0.09, 0.11), rim * 0.85);
  return vec4(mix(base.rgb, col, cov), 1.0);
}

void main() {
  vec2 p = uRect.xy + vUv * uRect.zw;
  vec4 c;
  if (uFace == 1) {
    c = mouth(p, texAt(p));
    float blush = exp(-dot((p - uCheeks.xy) / vec2(48.0, 22.0), (p - uCheeks.xy) / vec2(48.0, 22.0)))
                + exp(-dot((p - uCheeks.zw) / vec2(40.0, 20.0), (p - uCheeks.zw) / vec2(40.0, 20.0)));
    c.rgb = mix(c.rgb, c.rgb * vec3(1.0, 0.62, 0.64) , clamp(blush * uCheek * 0.55, 0.0, 1.0) * c.a);
  } else if (uFace >= 2) {
    c = eyeBall(uFace - 2, p);
  } else {
    c = texAt(p);
  }
  outColor = c * uAlpha;
}`;
