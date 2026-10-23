import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { PixelImage } from "../builder/pixels";
import type { Eye } from "./types";
import { restHead } from "./drivers";
import { syntheticBust } from "./synthesis/syntheticBust";
import { synthesizeRig } from "./synthesis/rigGeometry";
import { cutHeadLayers } from "./synthesis/layers";
import { eyeTone, FALLBACK_SCLERA, gazeLimits, gazeOffset, interior, irisSpan, irisWeight, renderOpenBall, scleraTone, slideBall, type GazeMode, type Rgba, type Tone } from "./gaze";
import { FS } from "./shaders";
import { HeadRenderer } from "./renderer";
import { syntheticHead } from "./synthetic";
import { FakeWebGl, fakeCanvas, fakeLayerImage } from "../../../test/support/fakeWebGl";

const GOLDEN = join(__dirname, "../../../test/goldens/liveHead/gaze-iris.json");
const sha = (image: PixelImage): string => createHash("sha256").update(image.data).digest("hex");

function fixture() {
  const bust = syntheticBust(2), rig = synthesizeRig(bust.landmarks), layers = cutHeadLayers(bust.image, rig);
  return rig.eyes.map((eye, index) => {
    const layer = layers.find((entry) => entry.name === `eye${index}_ball`)!;
    const tone = scleraTone(layer.image.data);
    return { eye, index, rect: layer.rect, image: layer.image, tone, span: irisSpan(layer.image, layer.rect, eye, tone) };
  });
}

const pixel = (image: PixelImage, k: number): Rgba => [image.data[k] / 255, image.data[k + 1] / 255, image.data[k + 2] / 255, image.data[k + 3] / 255];
const curve = (values: number[], u: number): number => {
  const f = Math.min(1, Math.max(0, u)) * 23, i = Math.min(Math.floor(f), 22);
  return values[i] + (values[i + 1] - values[i]) * (f - i);
};
function irisMask(image: PixelImage, tone: Tone, rect: number[], eye: Eye): Uint8Array {
  const mask = new Uint8Array(image.width * image.height);
  for (let k = 0; k < mask.length; k++) {
    const px = rect[0] + k % image.width + 0.5, py = rect[1] + Math.floor(k / image.width) + 0.5, u = (px - eye.x0) / (eye.x1 - eye.x0);
    mask[k] = irisWeight(pixel(image, k * 4), tone) > 0.5 && interior(py, curve(eye.top, u), curve(eye.bot, u)) > 0.99 && image.data[k * 4 + 3] > 191 ? 1 : 0;
  }
  return mask;
}
function shape(mask: Uint8Array, width: number) {
  let n = 0, sx = 0, sy = 0;
  mask.forEach((on, k) => { if (on) { n++; sx += k % width; sy += Math.floor(k / width); } });
  const cx = sx / n, cy = sy / n;
  let xx = 0, yy = 0;
  mask.forEach((on, k) => { if (on) { xx += (k % width - cx) ** 2; yy += (Math.floor(k / width) - cy) ** 2; } });
  return { area: n, cx, cy, aspect: Math.sqrt(xx / yy) };
}
function innerMap(rect: number[], eye: Eye): Uint8Array {
  const map = new Uint8Array(rect[2] * rect[3]);
  for (let k = 0; k < map.length; k++) {
    const px = rect[0] + k % rect[2] + 0.5, py = rect[1] + Math.floor(k / rect[2]) + 0.5, u = (px - eye.x0) / (eye.x1 - eye.x0);
    map[k] = interior(py, curve(eye.top, u), curve(eye.bot, u)) > 0.99 ? 1 : 0;
  }
  return map;
}
function shiftedOverlap(mask: Uint8Array, reference: Uint8Array, opening: PixelImage, inner: Uint8Array, width: number, dx: number): number {
  let inter = 0, union = 0;
  for (let k = 0; k < mask.length; k++) {
    const x = k % width, from = x - Math.round(dx), y = Math.floor(k / width);
    const expected = from >= 0 && from < width && opening.data[k * 4 + 3] > 191 && inner[k] ? reference[y * width + from] : 0;
    if (mask[k] && expected) inter++;
    if (mask[k] || expected) union++;
  }
  return inter / Math.max(1, union);
}

describe("live head gaze keeps the iris round", () => {
  beforeAll(() => { Object.assign(globalThis, { window: { devicePixelRatio: 1 } }); });
  const eyes = fixture();
  const render = (entry: (typeof eyes)[number], gaze: number, mode: GazeMode) =>
    renderOpenBall(entry.image, entry.rect, entry.eye, gazeOffset(entry.index, gaze, 0), mode, entry.tone, entry.span);

  test("sclera tone reads the white, not the iris", () => {
    for (const entry of eyes) {
      expect(entry.tone).not.toBeNull();
      entry.tone!.forEach((channel) => expect(channel).toBeGreaterThan(0.95));
    }
    expect(scleraTone(new Uint8ClampedArray(64 * 4).fill(40))).toBeNull();
    expect(scleraTone(new Uint8ClampedArray(8 * 4).fill(255))).toBeNull();
  });

  test("gaze 0 is the shipped dome path byte for byte, and slideBall is identity without a move", () => {
    for (const entry of eyes) expect(sha(render(entry, 0, "slide"))).toBe(sha(render(entry, 0, "dome")));
    const tone: Tone = [0.98, 0.98, 0.96];
    for (const c of [[0.2, 0.3, 0.6, 1], [0.98, 0.98, 0.96, 1], [0.1, 0.1, 0.1, 0.4], [0, 0, 0, 0]] as Rgba[]) {
      const out = slideBall(c, c, tone);
      out.forEach((value, k) => expect(value).toBeCloseTo(c[k], 6));
    }
  });

  test("at gaze +-1 the iris translates whole inside the opening; the dome warp squeezed it", () => {
    const report: Record<string, unknown> = {}, checks: Array<() => void> = [];
    for (const entry of eyes) {
      const tone = entry.tone!, width = entry.rect[2], inner = innerMap(entry.rect, entry.eye);
      const rest = irisMask(render(entry, 0, "slide"), tone, entry.rect, entry.eye), restShape = shape(rest, width);
      for (const gaze of [-1, 1]) {
        const [dx] = gazeOffset(entry.index, gaze, 0);
        const slide = irisMask(render(entry, gaze, "slide"), tone, entry.rect, entry.eye), dome = irisMask(render(entry, gaze, "dome"), tone, entry.rect, entry.eye);
        const s = shape(slide, width), d = shape(dome, width);
        const slideOverlap = shiftedOverlap(slide, rest, entry.image, inner, width, dx), domeOverlap = shiftedOverlap(dome, rest, entry.image, inner, width, dx);
        report[`eye${entry.index} gaze ${gaze}`] = { slideOverlap, domeOverlap, slideAspect: s.aspect, domeAspect: d.aspect, restAspect: restShape.aspect };
        checks.push(() => {
          expect(slideOverlap).toBeGreaterThan(0.9);
          expect(slideOverlap).toBeGreaterThan(domeOverlap);
          expect(Math.abs(s.cx - restShape.cx - dx)).toBeLessThan(0.75);
          expect(Math.abs(s.aspect - restShape.aspect)).toBeLessThan(Math.abs(d.aspect - restShape.aspect));
        });
        report[`eye${entry.index} gaze ${gaze}`] = { ...(report[`eye${entry.index} gaze ${gaze}`] as object), slideCx: s.cx - restShape.cx, slideArea: s.area, domeArea: d.area, restArea: restShape.area };
      }
    }
    if (process.env.SO_GAZE_REPORT === "1") process.stdout.write(`${JSON.stringify(report, null, 1)}
`);
    checks.forEach((check) => check());
    expect(Object.keys(report)).toHaveLength(4);
  });

  test("the old iris position fills with the sclera tone, no hole and no skin edge", () => {
    for (const entry of eyes) {
      const tone = entry.tone!, moved = render(entry, 1, "slide"), still = render(entry, 0, "slide");
      const trailing = Math.round(entry.rect[3] / 2) * entry.rect[2] + Math.round((entry.eye.x0 + entry.eye.x1) / 2 - entry.rect[0]) - 6;
      const before = pixel(still, trailing * 4), after = pixel(moved, trailing * 4);
      expect(irisWeight(before, tone)).toBeGreaterThan(0.5);
      expect(irisWeight(after, tone)).toBeLessThan(0.05);
      after.slice(0, 3).forEach((channel, k) => expect(Math.abs(channel / after[3] - tone[k])).toBeLessThan(0.02));
      for (let k = 0; k < moved.data.length; k += 4) expect(moved.data[k + 3]).toBe(still.data[k + 3]);
    }
  });

  test("no iris is left behind at the old position, edge rows included (synthetic iris disc, r 8 at scale 2)", () => {
    for (const entry of eyes) {
      const tone = entry.tone!, cx = [62, 98][entry.index] * 2, cy = 156;
      for (const gaze of [-1, 1]) {
        const [dx] = gazeOffset(entry.index, gaze, 0), image = render(entry, gaze, "slide");
        let left = 0;
        for (let k = 0; k < image.width * image.height; k++) {
          const px = entry.rect[0] + k % image.width + 0.5, py = entry.rect[1] + Math.floor(k / image.width) + 0.5;
          if (Math.hypot(px - cx, py - cy) <= 7.5 && Math.hypot(px - cx - dx, py - cy) > 8.5 && image.data[k * 4 + 3] > 191
            && irisWeight(pixel(image, k * 4), tone) > 0.5) left++;
        }
        expect(left).toBe(0);
      }
    }
  });

  test("goldens: synthetic bust ball renders at gaze -1, 0, +1", () => {
    const summary = Object.fromEntries(eyes.flatMap((entry) => [-1, 0, 1].map((gaze) => [`eye${entry.index}:${gaze}`, sha(render(entry, gaze, "slide"))])));
    if (process.env.SO_UPDATE_GOLDEN === "1") { mkdirSync(dirname(GOLDEN), { recursive: true }); writeFileSync(GOLDEN, `${JSON.stringify(summary, null, 2)}\n`); }
    expect(summary).toEqual(JSON.parse(readFileSync(GOLDEN, "utf8")));
  });

  test("the shader mirrors the CPU model", () => {
    expect(FS).toContain("uniform vec4 uSclera[2];");
    expect(FS).toContain("smoothstep(0.1, 0.26, distance(c.rgb / c.a, tone)) * smoothstep(0.25, 0.75, c.a)");
    expect(FS).toContain("if (tone.w < 0.5 || (off.x == 0.0 && off.y == 0.0)) c = texAt(p - off * w);");
    expect(FS).toContain("uniform vec4 uIris[2];");
    expect(FS).toContain("return 1.0 - smoothstep(s.y + 1.0, s.y + 2.5, abs(x - s.x));");
    expect(FS).toContain("float xe = openAt(e, xf) > openAt(e, xn) ? xf : xn;");
    expect(FS).toContain("vec3 fill = mix(tone.rgb, bandFill(e, p, top, bot, tone.rgb), held);");
    expect(FS).toContain("float kept = min(1.0, (1.0 - held) * irisWeight(here, tone.rgb) + held * irisWeight(vec4(fill, 1.0), tone.rgb));");
    expect(FS).toContain("float inMoved = trust(q, crv(e, true, uq), crv(e, false, uq), tone.rgb) * spanWeight(e, q.x) * (1.0 - kept);");
    expect(FS).toContain("c = slideBall(here, texAt(q), tone.rgb, trust(p, top, bot, tone.rgb) * held, inMoved, fill);");
    expect(FS).toContain("vec3 rgb = h - irisWeight(here, tone) * inHere * (h - fill) + irisWeight(moved, tone) * inMoved * (m - fill);");
    expect(FS).toContain("return max(inside, irisWeight(texAt(vec2(q.x, inward)), tone) * interior(inward, top, bot));");
    expect(FS).toContain("smoothstep(0.5, 2.5, y - top) * smoothstep(0.5, 2.5, bot - y)");
  });

  test("the renderer uploads each ball's iris span and keeps a wide gaze inside the eye", () => {
    const saved = (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas;
    class Iris {
      constructor(private readonly width: number, private readonly height: number) {}
      getContext() {
        const { width, height } = this, data = new Uint8ClampedArray(width * height * 4).fill(250);
        for (let k = 0; k < width * height; k++) if (Math.hypot(k % width - width / 2, Math.floor(k / width) - height / 2) < Math.min(width, height) / 4) data.set([40, 60, 120, 255], k * 4);
        return { drawImage: () => undefined, getImageData: () => ({ data }) };
      }
    }
    (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas = Iris;
    try {
      const gl = new FakeWebGl(), set = jest.spyOn(gl, "uniform4fv"), head = new HeadRenderer(fakeCanvas(gl), syntheticHead);
      syntheticHead.layers.forEach((layer) => head.add(layer, fakeLayerImage(layer.rect[2], layer.rect[3], layer.name)));
      head.draw({ ...restHead(), gazeX: 1 });
      const last = (name: string) => Array.from(set.mock.calls.filter(([key]) => key === name).at(-1)![1] as ArrayLike<number>);
      const iris = last("uIris"), state = last("uEyeState");
      expect(iris[2]).toBe(1); expect(iris[6]).toBe(1);
      syntheticHead.rig.eyes.forEach((eye, index) => {
        const [lo, hi] = gazeLimits(eye, [iris[index * 4], iris[index * 4 + 1]])!;
        expect(state[index * 4 + 2]).toBeCloseTo(Math.min(hi, Math.max(lo, gazeOffset(index, 1, 0)[0])), 5);
      });
    } finally { (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas = saved; }
  });

  test("shaded eye whites fall back to a near-white plate, so a gaze slide never shows through the eye; the warp without a tone did", () => {
    for (const { eye, rect, image } of fixture()) {
      const data = new Uint8ClampedArray(image.data);
      for (let k = 0; k < data.length; k += 4) for (let c = 0; c < 3; c++) data[k + c] = Math.round(data[k + c] * 0.55);
      const shaded: PixelImage = { ...image, data };
      expect(scleraTone(shaded.data)).toBeNull();
      expect(eyeTone(shaded.data)).toEqual(FALLBACK_SCLERA);
      const tone = eyeTone(shaded.data), span = irisSpan(shaded, rect, eye, tone);
      const seeThrough = (out: PixelImage): number => {
        let count = 0;
        for (let k = 0; k < out.width * out.height; k++) {
          const px = rect[0] + k % out.width + 0.5, py = rect[1] + Math.floor(k / out.width) + 0.5, u = (px - eye.x0) / (eye.x1 - eye.x0);
          if (u <= 0.05 || u >= 0.95 || interior(py, curve(eye.top, u) + 1, curve(eye.bot, u) - 1) < 1 || shaded.data[k * 4 + 3] < 230) continue;
          if (out.data[k * 4 + 3] < 230) count++;
        }
        return count;
      };
      let warped = 0;
      for (let gx = -1; gx <= 1; gx += 0.25) for (let gy = -1; gy <= 1; gy += 0.25) {
        const offset: [number, number] = [gx * 14, -gy * 8.4];
        expect(seeThrough(renderOpenBall(shaded, rect, eye, offset, "slide", tone, span))).toBe(0);
        warped += seeThrough(renderOpenBall(shaded, rect, eye, offset, "slide", null, null));
      }
      expect(warped).toBeGreaterThan(0);
    }
  });

  test("the renderer passes a sclera tone only when it can read the ball pixels", () => {
    const draw = (offscreen: unknown) => {
      const saved = (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas;
      (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas = offscreen;
      try {
        const gl = new FakeWebGl(), set = jest.spyOn(gl, "uniform4fv"), head = new HeadRenderer(fakeCanvas(gl), syntheticHead);
        syntheticHead.layers.forEach((layer) => head.add(layer, fakeLayerImage(layer.rect[2], layer.rect[3], layer.name)));
        head.draw({ ...restHead(), gazeX: 1 });
        return set.mock.calls.filter(([name]) => name === "uSclera").map(([, values]) => Array.from(values as ArrayLike<number>));
      } finally { (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas = saved; }
    };
    expect(draw(undefined)).toEqual([]);
    class White {
      constructor(private readonly width: number, private readonly height: number) {}
      getContext() {
        return { drawImage: () => undefined, getImageData: () => ({ data: new Uint8ClampedArray(this.width * this.height * 4).fill(250) }) };
      }
    }
    const [tone] = draw(White);
    expect(tone).toHaveLength(8);
    expect(tone[3]).toBe(1); expect(tone[7]).toBe(1);
    expect(tone[0]).toBeCloseTo(250 / 255, 5);
    class Grey {
      constructor(private readonly width: number, private readonly height: number) {}
      getContext() {
        return { drawImage: () => undefined, getImageData: () => ({ data: new Uint8ClampedArray(this.width * this.height * 4).fill(110) }) };
      }
    }
    const [plate] = draw(Grey);
    expect(plate.slice(0, 3).map((value) => Math.round(value * 100) / 100)).toEqual(FALLBACK_SCLERA);
    expect(plate[3]).toBe(1);
    class Broken { getContext() { throw new Error("tainted"); } }
    expect(draw(Broken)).toEqual([]);
  });
});
