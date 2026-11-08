import { driftCamera, flameFlicker, flashAt, lightningStrokes, particleDensity, Phase } from "./layers";
import { crossfadeMix, mergeModifiers } from "./renderer";
import { dimForContrast } from "./contrast";

describe("v3.0 45 review: motion stays continuous", () => {
  it("a speed change bends the phase instead of jumping it", () => {
    const phase = new Phase();
    for (let frame = 0; frame < 600; frame += 1) phase.advance(1 / 60, 1);
    const before = phase.value;
    const next = phase.advance(1 / 60, 2.5);
    expect(next - before).toBeGreaterThan(1 / 60 - 1e-9);
    expect(next - before).toBeLessThan(0.03);
  });

  it("zero intensity means no particles and no camera drift", () => {
    expect(particleDensity(0)).toBe(0);
    expect(particleDensity(0.01)).toBeLessThan(0.05);
    expect(particleDensity(1)).toBe(1);
    const still = driftCamera(123, 1, 0);
    expect([Math.abs(still.x), Math.abs(still.y), still.zoom]).toEqual([0, 0, 1]);
  });

  it("drift never shows the image edge", () => {
    for (let t = 0; t < 400; t += 3.7) {
      const camera = driftCamera(t, 1, 1);
      const margin = (1 - 1 / camera.zoom) / 2;
      expect(Math.abs(camera.x)).toBeLessThanOrEqual(margin);
      expect(Math.abs(camera.y)).toBeLessThanOrEqual(margin);
    }
  });

  it("lightning is dark between strikes and decays within half a second", () => {
    const strokes = lightningStrokes(7);
    expect(flashAt(strokes, -0.1)).toBe(0);
    expect(flashAt(strokes, 0)).toBeCloseTo(1);
    expect(flashAt(strokes, 0.9)).toBeLessThan(0.02);
  });

  it("firelight flicker stays slow and bounded", () => {
    const values = Array.from({ length: 600 }, (_, index) => flameFlicker(index / 60));
    expect(Math.max(...values.map(Math.abs))).toBeLessThanOrEqual(1);
    const steps = values.slice(1).map((value, index) => Math.abs(value - values[index]));
    expect(Math.max(...steps)).toBeLessThan(0.1);
  });

  it("crossfades ease in and out", () => {
    expect(crossfadeMix(0)).toBe(0);
    expect(crossfadeMix(600)).toBeCloseTo(0.5);
    expect(crossfadeMix(5000)).toBe(1);
  });

  it("base modifiers from several layers merge", () => {
    const texture = {} as WebGLTexture;
    expect(Object.keys(mergeModifiers([{ depth: { texture, offset: [0, 0], scale: 1, focus: 0.3 } }, null, { ripple: { texture, channel: "water", amount: 1, time: 0 } }]))).toEqual(["depth", "ripple"]);
  });

  it("dims in display space, so a bright still is not over-darkened", () => {
    expect(dimForContrast(0.4, 1)).toBeCloseTo(1 - (0.1833 / 0.4) ** (1 / 2.2), 3);
    expect(dimForContrast(0.4, 1)).toBeLessThan(1 - 0.1833 / 0.4);
  });
});
