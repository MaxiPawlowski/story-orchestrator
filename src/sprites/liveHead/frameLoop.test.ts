import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { FakeWebGl, fakeCanvas, fakeLayerImage } from "../../../test/support/fakeWebGl";
import * as hash from "@runtime/hash";
import * as drivers from "./drivers";
import { driveHead } from "./drivers";
import { HeadDriver } from "./headDriver";
import { frameGate } from "./mount";
import { HeadRenderer } from "./renderer";
import { syntheticHead } from "./synthetic";

const GOLDEN = resolve(__dirname, "../../../test/goldens/liveHead/frame-loop.json");

interface Arm { seed: string; label: string; motion: boolean; streamFrom: number; streamTo: number; options: { breathing?: boolean; blink?: boolean; mouth?: boolean } }
const ARMS: Record<string, Arm> = {
  idle: { seed: "shape", label: "neutral", motion: true, streamFrom: 1e9, streamTo: 0, options: {} },
  joyStream: { seed: "circle", label: "joy", motion: true, streamFrom: 1500, streamTo: 6500, options: {} },
  surprise: { seed: "square", label: "surprise", motion: true, streamFrom: 0, streamTo: 9000, options: { breathing: false } },
  reduced: { seed: "shape", label: "anger", motion: false, streamFrom: 0, streamTo: 9000, options: {} },
  quiet: { seed: "shape", label: "sad", motion: true, streamFrom: 0, streamTo: 9000, options: { blink: false, mouth: false } },
};

function renderArm(arm: Arm, frames: (time: number, gl: FakeWebGl, renderer: HeadRenderer) => void): string[] {
  const gl = new FakeWebGl(), renderer = new HeadRenderer(fakeCanvas(gl), syntheticHead);
  syntheticHead.layers.forEach((layer) => renderer.add(layer, fakeLayerImage(layer.rect[2], layer.rect[3], layer.name)));
  for (let time = 0; time <= 9000; time += 90) frames(time, gl, renderer);
  return gl.finish();
}

const streaming = (arm: Arm, time: number) => time >= arm.streamFrom && time < arm.streamTo;
const candidate = (arm: Arm) => {
  const driver = new HeadDriver(arm.seed);
  return renderArm(arm, (time, _gl, renderer) => renderer.draw(driver.drive(time, arm.label, streaming(arm, time), arm.motion,
    arm.options.breathing !== false, arm.options.blink !== false, arm.options.mouth !== false)));
};
const reference = (arm: Arm) => renderArm(arm, (time, _gl, renderer) =>
  renderer.draw(driveHead(arm.seed, time, arm.label, streaming(arm, time), arm.motion, arm.options)));

beforeAll(() => { Object.assign(globalThis, { window: { devicePixelRatio: 1 } }); });

describe("frame loop golden", () => {
  test("rendered draws for a fixed clock match the recorded golden", () => {
    const actual = Object.fromEntries(Object.entries(ARMS).map(([name, arm]) => [name, candidate(arm)]));
    if (process.env.SO_WRITE_LIVE_HEAD_GOLDEN === "1") writeFileSync(GOLDEN, `${JSON.stringify(actual, null, 1)}\n`);
    const golden = JSON.parse(readFileSync(GOLDEN, "utf8")) as Record<string, string[]>;
    for (const name of Object.keys(ARMS)) expect({ name, frames: actual[name] }).toEqual({ name, frames: golden[name] });
  });
  test("the reference driver still renders the golden", () => {
    const golden = JSON.parse(readFileSync(GOLDEN, "utf8")) as Record<string, string[]>;
    expect(reference(ARMS.joyStream)).toEqual(golden.joyStream);
  });
});

describe("steady-state driver", () => {
  const labels = ["neutral", "joy", "anger", "sad", "surprise", "sleepy", "embarrassment", "unknown"];
  test("matches driveHead exactly across seeds, labels, clocks, motion and switches", () => {
    for (const seed of ["shape", "circle", "a", ""]) {
      const driver = new HeadDriver(seed);
      for (let time = -50; time < 30_000; time += 37) {
        const label = labels[Math.floor(time / 900 + labels.length) % labels.length];
        const mask = Math.floor(Math.abs(time) / 1300) % 16, motion = (mask & 1) === 0, stream = (mask & 2) === 0;
        const breathing = (mask & 4) === 0, blink = (mask & 8) === 0, mouth = mask !== 6;
        const expected = driveHead(seed, time, label, stream, motion, { breathing, blink, mouth });
        expect({ seed, time, ...driver.drive(time, label, stream, motion, breathing, blink, mouth) }).toEqual({ seed, time, ...expected });
      }
      expect({ ...driver.drive(Number.NaN, "joy", true, true) }).toEqual(driveHead(seed, Number.NaN, "joy", true, true));
    }
  });
  test("reuses one parameter object and hashes the seed once per blink cycle", () => {
    const fnv = jest.spyOn(hash, "fnv1a"), expression = jest.spyOn(drivers, "expressionHead");
    const driver = new HeadDriver("shape"), first = driver.drive(0, "joy", true, true);
    for (let time = 0; time < 16_000; time += 4) expect(driver.drive(time, "joy", true, true)).toBe(first);
    expect(fnv).toHaveBeenCalledTimes(1 + 2);
    expect(expression).toHaveBeenCalledTimes(1);
    driver.drive(16_000, "anger", false, true);
    expect(expression).toHaveBeenCalledTimes(2);
    fnv.mockRestore(); expression.mockRestore();
  });
});

describe("uploads and frame cap", () => {
  const renderer = () => {
    const gl = new FakeWebGl(), head = new HeadRenderer(fakeCanvas(gl), syntheticHead);
    syntheticHead.layers.forEach((layer) => head.add(layer, fakeLayerImage(layer.rect[2], layer.rect[3], layer.name)));
    return { gl, head };
  };
  test("steady reduced motion uploads nothing after the first frame; moving frames upload every layer once", () => {
    const { gl, head } = renderer(), driver = new HeadDriver("shape");
    for (let time = 0; time < 2000; time += 16) head.draw(driver.drive(time, "anger", true, false));
    expect(gl.counts.bufferSubData).toBe(9);
    expect(gl.counts.draws).toBe(9 * 125);
    const moving = renderer(), idle = new HeadDriver("shape");
    for (let time = 0; time < 2000; time += 16) moving.head.draw(idle.drive(time, "neutral", true, true));
    expect(moving.gl.counts.bufferSubData).toBe(9 * 125);
  });
  test("a lid-only change re-uploads only the lash, lower lid and crease layers", () => {
    const { gl, head } = renderer(), p = { ...drivers.restHead() };
    head.draw(p); const after = gl.counts.bufferSubData;
    head.draw({ ...p, eyeOpen: 0.4 });
    expect(gl.counts.bufferSubData - after).toBe(6);
    head.draw({ ...p, eyeOpen: 0.4, gazeX: 1, blush: 1, mouthForm: 1 });
    expect(gl.counts.bufferSubData - after).toBe(6);
  });
  test.each([[240, 60], [144, 60], [120, 60], [60, 60], [30, 30]])("a %i Hz display draws at most %i frames a second", (hz, cap) => {
    const gate = frameGate(); let draws = 0, longest = 0, last = 0;
    gate();
    for (let tick = 1; tick <= hz * 10; tick++) {
      const now = tick * 1000 / hz + (tick % 3) * 0.3;
      if (gate(now)) { draws++; if (last) longest = Math.max(longest, now - last); last = now; }
    }
    expect(draws).toBeLessThanOrEqual(cap * 10 * 1.22);
    expect(draws).toBeGreaterThanOrEqual(Math.min(cap, hz) * 10 * 0.95);
    expect(longest).toBeLessThan(2 * 1000 / Math.min(hz, 60) + 1);
  });
});
