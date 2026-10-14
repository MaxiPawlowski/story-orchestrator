import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { FakeWebGl, fakeCanvas, fakeLayerImage } from "../../../test/support/fakeWebGl";
import type { PixelImage } from "../builder/pixels";
import { TextMouth } from "../lipsync/textMouth";
import { restHead } from "./drivers";
import { cutDrawn } from "./drawn";
import { HeadDriver, visemeMouth } from "./headDriver";
import { MESH_MOUTH_CAP, MeshMouth, cappedForm, cappedOpen, meshMouthMode, mouthRegionProblem } from "./meshMouth";
import type { HeadManifest } from "./manifest";
import { HeadRenderer } from "./renderer";
import { syntheticHead } from "./synthetic";
import { syntheticFrames } from "./syntheticFrames";
import type { Rig } from "./types";

const GOLDEN = resolve(__dirname, "../../../test/goldens/liveHead/mouth-curve.json");
const rig = syntheticHead.rig;
const withMouth = (change: (mouth: Rig["mouth"]) => void): Rig => {
  const copy = JSON.parse(JSON.stringify(rig)) as Rig;
  change(copy.mouth);
  return copy;
};

function syntheticArt(): PixelImage {
  const { width, height } = rig.image, data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const lip = Math.abs(y - rig.mouth.cy) < 1 && Math.abs(x - rig.mouth.cx) < rig.mouth.halfLen;
    data.set([...(lip ? [168, 70, 78] : [236, 200, 90 + ((x * 7 + y * 3) % 11) * 12]), 255], (y * width + x) * 4);
  }
  return { width, height, data };
}

beforeAll(() => { Object.assign(globalThis, { window: { devicePixelRatio: 1 } }); });

describe("mesh mouth cap", () => {
  test("open and form are scaled into the subtle range and clamped", () => {
    expect(cappedOpen(0.9)).toBe(MESH_MOUTH_CAP.openMax);
    expect(cappedOpen(0.5)).toBeCloseTo(0.09, 10);
    expect(cappedOpen(-1)).toBe(0);
    expect(cappedForm(-1)).toBe(-MESH_MOUTH_CAP.formMax);
    expect(cappedForm(0.4)).toBeCloseTo(0.08, 10);
  });
  test("full passes the parameters through, capped scales them, still holds the mouth shut", () => {
    const p = { ...restHead(), mouthOpen: 0.9, mouthForm: -0.8, gazeX: 0.3 };
    expect(new MeshMouth("full").apply(p, 16)).toBe(p);
    expect(new MeshMouth("capped").apply(p, 0)).toEqual({ ...p, mouthOpen: 0.15, mouthForm: -0.12 });
    expect(new MeshMouth("still").apply(p, 16)).toEqual({ ...p, mouthOpen: 0, mouthForm: 0 });
    expect(p.mouthOpen).toBe(0.9);
  });
  test("capped motion is smoothed: it rises over the attack, falls over the release and settles exactly", () => {
    const mouth = new MeshMouth("capped"), open = { ...restHead(), mouthOpen: 0.9 }, shut = restHead();
    const first = mouth.apply(open, 16).mouthOpen;
    expect(first).toBeCloseTo(0.15 * (1 - Math.exp(-16 / MESH_MOUTH_CAP.attackMs)), 10);
    for (let i = 0; i < 40; i++) mouth.apply(open, 16);
    expect(mouth.apply(open, 16).mouthOpen).toBe(0.15);
    const falling = mouth.apply(shut, 16).mouthOpen;
    expect(falling).toBeCloseTo(0.15 * Math.exp(-16 / MESH_MOUTH_CAP.releaseMs), 10);
    for (let i = 0; i < 60; i++) mouth.apply(shut, 16);
    expect(mouth.apply(shut, 16).mouthOpen).toBe(0);
  });
});

describe("mouth region guard", () => {
  test("the synthetic rig is sound", () => { expect(mouthRegionProblem(rig)).toBeNull(); });
  test("zero width, non-numbers or a mouth outside the face oval keep the mouth still", () => {
    expect(mouthRegionProblem(withMouth((mouth) => { mouth.halfLen = 0.5; }))).toBe("The rig's mouth region has no width.");
    expect(mouthRegionProblem(withMouth((mouth) => { mouth.area.rx = -3; }))).toBe("The rig's mouth region has no width.");
    expect(mouthRegionProblem(withMouth((mouth) => { mouth.cy = Number.NaN; }))).toBe("The rig's mouth landmarks are not numbers.");
    expect(mouthRegionProblem(withMouth((mouth) => { mouth.cy = 150; mouth.area.cy = 150; }))).toBe("The rig's mouth region falls outside the face oval.");
    expect(mouthRegionProblem(withMouth((mouth) => { mouth.halfLen = 60; }))).toBe("The rig's mouth region falls outside the face oval.");
  });
  test("mode: still beats drawn, drawn mouths get full, mesh-only is capped", () => {
    const broken = withMouth((mouth) => { mouth.cy = 170; });
    expect(meshMouthMode(rig, false)).toBe("capped");
    expect(meshMouthMode(rig, true)).toBe("full");
    expect(meshMouthMode(broken, true)).toBe("still");
  });
});

describe("renderer mouth modes", () => {
  const art = syntheticArt(), frames = syntheticFrames(art, rig), all = cutDrawn(rig, art, frames).sprites;
  const head = (manifest: HeadManifest = syntheticHead) => {
    const gl = new FakeWebGl(), renderer = new HeadRenderer(fakeCanvas(gl), manifest);
    manifest.layers.forEach((layer) => renderer.add(layer, fakeLayerImage(layer.rect[2], layer.rect[3], layer.name)));
    return { gl, renderer };
  };
  const shader = (gl: FakeWebGl) => gl.uniformValue("uMouthState") ?? [];
  test("mesh-only heads and heads with only drawn eyes draw the capped shader mouth", () => {
    const plain = head(), eyes = head();
    eyes.renderer.addDrawn(all.filter((sprite) => sprite.name.startsWith("eyes")));
    for (const { gl, renderer } of [plain, eyes]) {
      expect(renderer.mouthMode()).toBe("capped");
      renderer.draw({ ...restHead(), mouthOpen: 0.9, mouthForm: -1 });
      expect(shader(gl).slice(0, 2)).toEqual([0.15, -0.12]);
    }
  });
  test("drawn mouths keep full behaviour: the shader stays shut and the drawn mouth sees the full openness", () => {
    const { gl, renderer } = head();
    renderer.addDrawn(all);
    expect(renderer.mouthMode()).toBe("full");
    renderer.draw({ ...restHead(), mouthOpen: 0.9 });
    expect(shader(gl)[0]).toBe(0);
    expect(gl.counts.draws).toBe(9 + 1);
  });
  test("a degenerate mouth region keeps the mesh mouth shut and reports still", () => {
    const broken = { ...syntheticHead, rig: withMouth((mouth) => { mouth.halfLen = 0.25; }) };
    const { gl, renderer } = head(broken);
    expect(renderer.mouthMode()).toBe("still");
    renderer.draw({ ...restHead(), mouthOpen: 0.9 });
    expect(shader(gl)[0]).toBe(0);
  });
  test("reduced motion and the mouth setting keep the capped mouth at rest with no re-upload", () => {
    for (const [motion, mouthOn] of [[false, true], [true, false]]) {
      const { gl, renderer } = head(), driver = new HeadDriver("shape");
      let uploads = 0;
      for (let time = 0; time < 1600; time += 32) {
        renderer.draw(driver.drive(time, "joy", true, motion, true, true, mouthOn), time);
        expect(shader(gl)[0]).toBe(0);
        if (time === 0) uploads = gl.counts.bufferSubData;
      }
      if (!motion) expect(gl.counts.bufferSubData).toBe(uploads);
    }
  });
});

describe("scripted reply mouth curve", () => {
  const REPLY = "Hello there! How are you today? Oh, we should go.";
  function curve() {
    const text = new TextMouth(), driver = new HeadDriver("shape"), capped = new MeshMouth("capped");
    const rows: Array<[number, string, number, number, number, number]> = [];
    for (let now = 0, sent = 0; now <= 4200; now += 30) {
      const due = Math.min(REPLY.length, Math.floor(now / 40));
      if (due > sent) { sent = due; text.push(REPLY.slice(0, sent), now); }
      const sample = text.sample(now);
      const full = visemeMouth(driver.drive(now, "neutral", true, true), sample);
      const fullOpen = full.mouthOpen, fullForm = full.mouthForm, mesh = capped.apply(full, 30);
      const round = (value: number) => Math.round(value * 10000) / 10000;
      rows.push([now, sample?.viseme ?? "-", round(fullOpen), round(fullForm), round(mesh.mouthOpen), round(mesh.mouthForm)]);
    }
    return rows;
  }
  test("matches the recorded golden: drawn heads follow the full curve, mesh-only heads the capped one", () => {
    const rows = curve();
    if (process.env.SO_WRITE_LIVE_HEAD_GOLDEN === "1") writeFileSync(GOLDEN, `${JSON.stringify({ reply: REPLY, columns: ["ms", "viseme", "fullOpen", "fullForm", "meshOpen", "meshForm"], rows }, null, 0)}\n`);
    const golden = JSON.parse(readFileSync(GOLDEN, "utf8")) as { rows: typeof rows };
    expect(rows).toEqual(golden.rows);
  });
  test("the capped curve still opens on vowels, never exceeds the cap and moves less per frame", () => {
    const rows = curve();
    const fullPeak = Math.max(...rows.map((row) => row[2])), meshPeak = Math.max(...rows.map((row) => row[4]));
    expect(fullPeak).toBeGreaterThan(0.6);
    expect(meshPeak).toBeLessThanOrEqual(MESH_MOUTH_CAP.openMax);
    expect(meshPeak).toBeGreaterThan(MESH_MOUTH_CAP.openMax * 0.6);
    expect(rows.every((row) => Math.abs(row[5]) <= MESH_MOUTH_CAP.formMax)).toBe(true);
    const vowels = rows.filter((row) => ["aa", "O", "E", "I"].includes(row[1]));
    expect(vowels.length).toBeGreaterThan(5);
    expect(vowels.filter((row) => row[4] > 0.03).length / vowels.length).toBeGreaterThan(0.6);
    const step = (column: 2 | 4) => Math.max(...rows.slice(1).map((row, index) => Math.abs(row[column] - rows[index][column])));
    expect(step(4)).toBeLessThan(step(2) * 0.25);
  });
});
