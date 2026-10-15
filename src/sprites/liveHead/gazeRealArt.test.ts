import type { PixelImage } from "../builder/pixels";
import type { Eye } from "./types";
import type { Rect } from "./manifest";
import { gazeLimits, gazeOffset, irisSpan, limitGaze, renderOpenBall, scleraTone, type Tone } from "./gaze";

const RECT: Rect = [100, 50, 30, 17];
const X0 = 103, X1 = 127, CX = 113;
const topAt = (u: number): number => 56 - 4.2 * Math.sin(Math.PI * u) + 2.5 * u;
const botAt = (u: number): number => 56 + 4.8 * Math.sin(Math.PI * u) + 2.5 * u;
const COLOURS = { outline: [22, 20, 26], crease: [205, 135, 95], iris: [60, 120, 80], pupil: [25, 70, 40], skin: [236, 196, 162], sclera: [250, 249, 245] } as const;
type Part = keyof typeof COLOURS | "none";

function realEye() {
  const samples = Array.from({ length: 24 }, (_, i) => i / 23);
  const eye: Eye = { x0: X0, x1: X1, top: samples.map(topAt), bot: samples.map(botAt),
    opening: [...samples.filter((_, i) => i % 4 === 0).map((u): [number, number] => [X0 + u * 24, topAt(u)]),
      ...samples.filter((_, i) => i % 4 === 2).reverse().map((u): [number, number] => [X0 + u * 24, botAt(u)])],
    roi: [[RECT[0], RECT[1]], [RECT[0] + RECT[2], RECT[1]], [RECT[0] + RECT[2], RECT[1] + RECT[3]], [RECT[0], RECT[1] + RECT[3]]] };
  const cy = (topAt((CX - X0) / 24) + botAt((CX - X0) / 24)) / 2;
  const parts: Part[] = [], data = new Uint8ClampedArray(RECT[2] * RECT[3] * 4);
  for (let j = 0; j < RECT[3]; j++) for (let i = 0; i < RECT[2]; i++) {
    const px = RECT[0] + i + 0.5, py = RECT[1] + j + 0.5, u = (px - X0) / (X1 - X0), uc = Math.min(1, Math.max(0, u));
    const top = topAt(uc), bot = botAt(uc), d = Math.min(py - top, bot - py), r = Math.hypot(px - CX, py - cy);
    let part: Part = "none";
    if (px >= X0 - 1 && px <= X1 + 1 && d > -1.2) {
      if (d < 0) part = py < top ? "crease" : "outline";
      else if (d < 1.3) part = "outline";
      else if (r < 1.8) part = "pupil";
      else if (r < 4.5) part = "iris";
      else if (u < 0.12 || u > 0.85) part = "skin";
      else part = "sclera";
    }
    parts.push(part);
    if (part !== "none") data.set([...COLOURS[part], 255], (j * RECT[2] + i) * 4);
  }
  return { eye, parts, image: { width: RECT[2], height: RECT[3], data } as PixelImage };
}

const at = (image: PixelImage, k: number): number[] => [0, 1, 2].map((c) => image.data[k * 4 + c] / 255);
const luma = (c: number[]): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const near = (c: number[], target: readonly number[], tolerance: number): boolean => c.every((value, k) => Math.abs(value - target[k] / 255) <= tolerance);
const opening = (x: number): number => { const u = (x - X0) / (X1 - X0); return botAt(u) - topAt(u); };

describe("gaze on real-rig-like art: a small eye, the drawn outline inside the opening, skin corners, little sclera", () => {
  const { eye, parts, image } = realEye();
  const tone = scleraTone(image.data) as Tone, span = irisSpan(image, RECT, eye, tone), limits = gazeLimits(eye, span);
  const travel = (gaze: number): number => limitGaze(gazeOffset(0, gaze, 0)[0], limits);
  const render = (gaze: number) => renderOpenBall(image, RECT, eye, [travel(gaze), 0], "slide", tone, span);

  test("the fill colour is the sclera, not the skin among the brightest pixels", () => {
    const opaque = parts.filter((part) => part !== "none").length;
    expect(parts.filter((part) => part === "sclera").length / opaque).toBeLessThan(0.3);
    expect(parts.filter((part) => part === "skin").length).toBeGreaterThan(0);
    tone.forEach((channel) => expect(channel).toBeGreaterThan(0.93));
  });

  test("the iris span covers the iris only, and travel keeps the whole iris where the eye is at least half open", () => {
    expect(span).not.toBeNull();
    expect(Math.abs(span![0] - CX)).toBeLessThanOrEqual(1);
    expect(span![1]).toBeGreaterThanOrEqual(3); expect(span![1]).toBeLessThanOrEqual(5.5);
    const tallest = Math.max(...Array.from({ length: 241 }, (_, i) => opening(X0 + i / 10)));
    expect(Math.abs(travel(1))).toBeLessThan(gazeOffset(0, 1, 0)[0]);
    for (const gaze of [-1, 1]) {
      expect(Math.abs(travel(gaze))).toBeGreaterThan(1);
      expect(opening(span![0] + travel(gaze) - span![1])).toBeGreaterThan(tallest * 0.45);
      expect(opening(span![0] + travel(gaze) + span![1])).toBeGreaterThan(tallest * 0.45);
    }
  });

  test.each([-1, 1])("gaze %d: the drawn outline never turns pale, skin and crease stay put, nothing pale spills", (gaze) => {
    const rest = render(0), moved = render(gaze), paleTone = tone.map((value) => value * 255);
    parts.forEach((part, k) => {
      const c = at(moved, k), shown = moved.data[k * 4 + 3] > 64;
      expect(moved.data[k * 4 + 3]).toBe(rest.data[k * 4 + 3]);
      if (part === "outline" && shown) expect(luma(c)).toBeLessThan(0.45);
      if (part === "skin" && shown) expect(near(c, COLOURS.skin, 0.06)).toBe(true);
      if (part !== "crease" && shown) expect(near(c, COLOURS.crease, 0.12)).toBe(false);
      if (part !== "sclera" && part !== "iris" && part !== "pupil" && shown) expect(near(c, paleTone, 0.04)).toBe(false);
    });
  });

  test.each([-1, 1])("gaze %d: the iris arrives at its limited offset, tucked under the drawn lid line", (gaze) => {
    const inner = parts.map((part) => part === "iris" || part === "pupil" || part === "sclera");
    const green = (c: number[]): number => Math.min(1, Math.max(0, (c[1] - (c[0] + c[2]) / 2) / 0.15));
    const mask = (img: PixelImage) => parts.map((_, k) => inner[k] ? green(at(img, k)) * img.data[k * 4 + 3] / 255 : 0);
    const centroid = (m: number[]) => { const n = m.reduce((a, b) => a + b, 0); return { n, cx: m.reduce((sum, w, k) => sum + w * (k % RECT[2]), 0) / n }; };
    const rest = centroid(mask(render(0))), moved = centroid(mask(render(gaze)));
    expect(moved.n / rest.n).toBeGreaterThan(0.6);
    expect(Math.abs(moved.cx - rest.cx - travel(gaze))).toBeLessThan(1);
  });
});
