import type { RunGuard } from "@runtime/runToken";
import type { PixelImage } from "../builder/pixels";
import { FakeWebGl, fakeCanvas, fakeLayerImage } from "../../../test/support/fakeWebGl";
import type { Actor } from "../castLoad";
import { actorHeadLooks } from "../liveHeadStage";
import { restHead } from "./drivers";
import { browWeight, deformInto } from "./geometry";
import { HeadDriver } from "./headDriver";
import { alignmentProblem, clearLookCache, cutLook, expressionTexture, HeadLooks, lookArt, prepareLook, squinted, type LookSurface, type PreparedLook } from "./expressions";
import { HeadRenderer, LOOK_FADE_MS } from "./renderer";
import { syntheticHead } from "./synthetic";
import type { DrawnDeps } from "./drawn";

const rig = syntheticHead.rig;
const sampled = (values: number[], u: number): number => {
  const f = Math.min(1, Math.max(0, u)) * 23, i = Math.min(Math.floor(f), 22);
  return values[i] + (values[i + 1] - values[i]) * (f - i);
};

function art(paint?: (x: number, y: number) => number[] | null): PixelImage {
  const { width, height } = rig.image, data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const eye = rig.eyes.find((entry) => x >= entry.x0 && x <= entry.x1 && y > sampled(entry.top, (x - entry.x0) / (entry.x1 - entry.x0)) && y < sampled(entry.bot, (x - entry.x0) / (entry.x1 - entry.x0)));
    const iris = eye && Math.abs(x - (eye.x0 + eye.x1) / 2) < 2;
    const lip = Math.abs(y - rig.mouth.cy) < 1 && Math.abs(x - rig.mouth.cx) < rig.mouth.halfLen;
    const outside = ((x - rig.head.cx) / (rig.head.rx * 1.7)) ** 2 + ((y - rig.head.cy) / (rig.head.ry * 1.7)) ** 2 > 1;
    const colour = paint?.(x, y) ?? (iris ? [40, 70, 150] : eye ? [246, 246, 248] : lip ? [168, 70, 78] : outside ? [(x * 37) % 256, 120, 90] : [236, 200, 170]);
    data.set([...colour, 255], (y * width + x) * 4);
  }
  return { width, height, data };
}
const neutral = art();
const smiling = art((x, y) => Math.abs(y - rig.mouth.cy - 1) < 2 && Math.abs(x - rig.mouth.cx) < rig.mouth.halfLen * 1.2 ? [190, 60, 70] : null);
const squinting = art((x, y) => rig.eyes.some((eye) => x >= eye.x0 && x <= eye.x1 && y < sampled(eye.bot, (x - eye.x0) / (eye.x1 - eye.x0)) - 1
  && y > sampled(eye.top, (x - eye.x0) / (eye.x1 - eye.x0)) - 1) ? [120, 80, 70] : null);
const shifted = (image: PixelImage, dx: number): PixelImage => {
  const data = new Uint8ClampedArray(image.data.length);
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
    const from = (y * image.width + Math.min(image.width - 1, Math.max(0, x - dx))) * 4;
    data.set(image.data.subarray(from, from + 4), (y * image.width + x) * 4);
  }
  return { ...image, data };
};
const guard = (check = () => true): RunGuard => ({ signal: new AbortController().signal, stillOwns: check, release: () => undefined, lapsed: () => null, lapsedDetail: () => null });

describe("which expression texture a label draws", () => {
  const pack = ["happy", "angry", "worried"];
  test("family labels reach the pipeline's three expressions; neutral and unknown keep the neutral art", () => {
    expect(expressionTexture("joy", pack)).toBe("happy");
    expect(expressionTexture("Amusement", pack)).toBe("happy");
    expect(expressionTexture("anger", pack)).toBe("angry");
    expect(expressionTexture("annoyance", pack)).toBe("angry");
    expect(expressionTexture("sadness", pack)).toBe("worried");
    expect(expressionTexture("fear", pack)).toBe("worried");
    expect(expressionTexture("happy", pack)).toBe("happy");
    expect(expressionTexture("neutral", pack)).toBeNull();
    expect(expressionTexture("surprise", pack)).toBeNull();
    expect(expressionTexture("joy", ["angry"])).toBeNull();
  });
  test("an exact pack label wins over its family", () => {
    expect(expressionTexture("joy", ["happy", "joy"])).toBe("joy");
    expect(expressionTexture("smirk", ["smirk"])).toBe("smirk");
  });
});

describe("expression art must be aligned with the rig", () => {
  test("a face-only change is accepted, a shift, a resize or an identical copy is refused", () => {
    expect(alignmentProblem(rig, neutral, smiling)).toBeNull();
    expect(alignmentProblem(rig, neutral, shifted(smiling, 3))).toMatch(/outside the head/);
    expect(alignmentProblem(rig, neutral, { width: neutral.width - 2, height: neutral.height, data: neutral.data.slice(0, (neutral.width - 2) * neutral.height * 4) })).toMatch(/size/);
    expect(alignmentProblem(rig, neutral, neutral)).toMatch(/identical/);
  });
  test("with a head box only changes inside the box pass", () => {
    const box = { x: 0, y: 0, width: rig.image.width, height: rig.image.height };
    const framed = lookArt(rig, smiling, box);
    if (typeof framed === "string") throw new Error(framed);
    expect(framed.region).toEqual([0, 0, rig.image.width, rig.image.height]);
    expect(alignmentProblem(rig, neutral, smiling, [0, 0, 4, 4])).toMatch(/outside the head box/);
    expect(alignmentProblem(rig, neutral, smiling, framed.region)).toBeNull();
  });
});

describe("cutting an expression onto the rig", () => {
  test("layers share the rig's rectangles; open eyes keep gaze, a squint turns gaze off", () => {
    const look = cutLook(rig, "happy", neutral, { image: smiling }, {}, undefined, syntheticHead.layers);
    if (typeof look === "string") throw new Error(look);
    const rects = Object.fromEntries(syntheticHead.layers.filter((layer) => layer.name !== "hand").map((layer) => [layer.name, layer.rect]));
    expect(Object.fromEntries(look.layers.map((layer) => [layer.name, layer.rect]))).toEqual(rects);
    expect(look.gaze).toEqual([true, true]);
    expect(rig.eyes.every((eye) => squinted(eye, neutral, squinting))).toBe(true);
    const squint = cutLook(rig, "angry", neutral, { image: squinting }, {});
    if (typeof squint === "string") throw new Error(squint);
    expect(squint.gaze).toEqual([false, false]);
  });
  test("a misaligned expression is refused before cutting", () => {
    expect(cutLook(rig, "happy", neutral, { image: shifted(smiling, 4) }, {})).toMatch(/not aligned/);
  });
  test("prepared looks are cached per art hash, expression and bytes", async () => {
    clearLookCache();
    const bytes = jest.fn(async (url: string) => new TextEncoder().encode(url).buffer as ArrayBuffer);
    const deps: DrawnDeps = { bytes, hash: async (value) => new TextDecoder().decode(value), pixels: async () => smiling };
    const first = await prepareLook(rig, "a".repeat(64), neutral, "happy", { art: "/happy.png", frames: {} }, undefined, guard(), deps);
    const again = await prepareLook(rig, "a".repeat(64), neutral, "happy", { art: "/happy.png", frames: {} }, undefined, guard(), deps);
    expect(typeof first).toBe("object");
    expect(again).toBe(first);
    expect(await prepareLook(rig, "a".repeat(64), neutral, "happy", { art: "/happy.png", frames: {} }, undefined, guard(() => false), deps)).toBeNull();
  });
});

describe("loading looks on demand", () => {
  const surface = () => { const calls: Array<[string, unknown]> = []; return { calls, surface: { addLook: (look: PreparedLook) => { calls.push(["add", look.name]); }, showLook: (name: string | null, cut: boolean) => { calls.push(["show", `${name}:${cut}`]); } } satisfies LookSurface & { calls?: unknown } }; };
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
  test("a textured label loads once, shows after it is ready, and stays parameter-free while loading", async () => {
    clearLookCache();
    const deps: DrawnDeps = { bytes: async (url) => new TextEncoder().encode(url).buffer as ArrayBuffer, hash: async (value) => new TextDecoder().decode(value),
      pixels: async (value) => new TextDecoder().decode(value).includes("happy") ? smiling : neutral };
    const looks = new HeadLooks({ looks: { happy: { art: "/happy.png", frames: {} } } }, deps), { calls, surface: fake } = surface();
    looks.bind({ rig, artHash: "b".repeat(64), layers: syntheticHead.layers, art: new TextEncoder().encode("neutral").buffer as ArrayBuffer, surface: fake, run: guard() }, () => undefined);
    looks.want("joy", false);
    expect(looks.textured()).toBe(true);
    looks.frame();
    await flush(); await flush();
    looks.frame();
    expect(calls).toEqual([["add", "happy"], ["show", "happy:false"]]);
    looks.want("surprise", true);
    expect(looks.textured()).toBe(false);
    looks.frame();
    expect(calls.at(-1)).toEqual(["show", "null:true"]);
  });
  test("the pipeline's expressions preload after the head is shown, never for a lapsed run", async () => {
    clearLookCache();
    const deps: DrawnDeps = { bytes: async (url) => new TextEncoder().encode(url).buffer as ArrayBuffer, hash: async (value) => new TextDecoder().decode(value),
      pixels: async (value) => new TextDecoder().decode(value).includes("happy") ? smiling : neutral };
    const timers: Array<() => void> = [], looks = new HeadLooks({ looks: { smirk: { art: "/smirk.png", frames: {} }, happy: { art: "/happy.png", frames: {} } } }, deps);
    let owned = true;
    const { calls, surface: fake } = surface();
    looks.bind({ rig, artHash: "d".repeat(64), layers: syntheticHead.layers, art: new TextEncoder().encode("neutral").buffer as ArrayBuffer, surface: fake, run: guard(() => owned) }, (run) => timers.push(run));
    expect(timers).toHaveLength(2);
    timers[0]();
    await flush(); await flush();
    expect(calls).toEqual([["add", "happy"]]);
    owned = false;
    timers[1]();
    await flush();
    expect(calls).toEqual([["add", "happy"]]);
  });
  test("a refused texture falls back to the neutral art and the parameter warp", async () => {
    clearLookCache();
    const deps: DrawnDeps = { bytes: async (url) => new TextEncoder().encode(url).buffer as ArrayBuffer, hash: async (value) => new TextDecoder().decode(value),
      pixels: async (value) => new TextDecoder().decode(value).includes("angry") ? shifted(smiling, 5) : neutral };
    const report = jest.fn(), looks = new HeadLooks({ looks: { angry: { art: "/angry.png", frames: {} } } }, deps, report), { calls, surface: fake } = surface();
    looks.bind({ rig, artHash: "c".repeat(64), layers: syntheticHead.layers, art: new TextEncoder().encode("neutral").buffer as ArrayBuffer, surface: fake, run: guard() }, () => undefined);
    looks.want("anger", false);
    looks.frame();
    await flush(); await flush();
    expect(looks.textured()).toBe(false);
    looks.frame();
    expect(calls).toEqual([["show", "null:false"]]);
    expect(report).toHaveBeenCalledWith("angry", null, expect.stringMatching(/not aligned/));
  });
});

describe("a textured expression is not warped twice, and brows never move the lids", () => {
  test("anger on a texture drives no brow or mouth warp; without a texture it keeps the accents", () => {
    const driver = new HeadDriver("shape");
    const plain = { ...driver.drive(0, "anger", false, false) }, textured = { ...driver.drive(0, "anger", false, false, true, true, true, true) };
    expect(plain.browY).toBeLessThan(0);
    expect([textured.browY, textured.browAngle, textured.mouthForm, textured.eyeSmile, textured.blush]).toEqual([0, 0, 0, 0, 0]);
  });
  test("the brow warp leaves the upper lid where it is", () => {
    const eye = rig.eyes[0], x = (eye.x0 + eye.x1) / 2, y = sampled(eye.top, 0.5), out = [0, 0];
    expect(browWeight(rig, x, y)).toBe(0);
    deformInto(rig, x, y, { ...restHead(), browY: -1, browAngle: 1 }, out);
    expect(out).toEqual([x, y]);
    expect(browWeight(rig, rig.face.brow.cx, Math.min(...eye.top) - 20)).toBeGreaterThan(0);
  });
});

describe("the stage hands every expression of the pack to the live head", () => {
  test("own frames when the expression has them, else the neutral frames; none when frames are off", () => {
    const actor = { set: "default", profile: { folder: "Ash" },
      packs: new Map([["default", new Map([["neutral", "/n.png"], ["happy", "/h.png"], ["angry", "/a.png"]])]]),
      frames: new Map([["default", new Map([["neutral", { blink: "/n.blink.png", talk: "/n.talk.png" }], ["happy", { talk: "/h.talk.png" }]])]]) } as unknown as Actor;
    const box = { x: 1, y: 2, width: 3, height: 4 };
    expect(actorHeadLooks(actor, true, { Ash: { box } } as never)).toEqual({ box, looks: {
      happy: { art: "/h.png", frames: { talk: "/h.talk.png" } }, angry: { art: "/a.png", frames: { blink: "/n.blink.png", talk: "/n.talk.png" } } } });
    expect(actorHeadLooks(actor, false)).toEqual({ looks: { happy: { art: "/h.png", frames: {} }, angry: { art: "/a.png", frames: {} } } });
    expect(actorHeadLooks({ ...actor, packs: new Map([["default", new Map([["neutral", "/n.png"]])]]) } as Actor, true)).toBeUndefined();
  });
});

describe("the renderer draws an expression texture on the same rig", () => {
  beforeAll(() => { Object.assign(globalThis, { window: { devicePixelRatio: 1 } }); });
  const make = () => {
    const gl = new FakeWebGl(), renderer = new HeadRenderer(fakeCanvas(gl), syntheticHead);
    syntheticHead.layers.forEach((layer) => renderer.add(layer, fakeLayerImage(layer.rect[2], layer.rect[3], layer.name)));
    return { gl, renderer };
  };
  const look = (gaze: [boolean, boolean] = [true, true]): PreparedLook => {
    const cut = cutLook(rig, "happy", neutral, { image: smiling }, {}, undefined, syntheticHead.layers);
    if (typeof cut === "string") throw new Error(cut);
    return { ...cut, gaze };
  };
  test("showing a look changes the frame; showing it again after neutral draws it identically", () => {
    const { gl, renderer } = make();
    renderer.addLook(look());
    renderer.draw(restHead(), 0);
    renderer.showLook("happy", true); renderer.draw(restHead(), 16);
    renderer.showLook(null, true); renderer.draw(restHead(), 32);
    expect(renderer.shownLook()).toBeNull();
    renderer.showLook("happy", true); renderer.draw(restHead(), 48);
    const [plain, happy, back, again] = gl.finish();
    expect(happy).not.toBe(plain);
    expect(back).not.toBe(happy);
    expect(again).toBe(happy);
  });
  test("a label change crossfades over the fade time; reduced motion cuts", () => {
    const { gl, renderer } = make(), mixes: number[] = [];
    const spy = jest.spyOn(gl, "uniform1f").mockImplementation((name: string, value: number) => { if (name === "uMix" && value > 0) mixes.push(value); });
    renderer.addLook(look());
    renderer.draw(restHead(), 0);
    renderer.showLook("happy", false);
    for (let t = 16; t <= LOOK_FADE_MS + 64; t += 16) renderer.draw(restHead(), t);
    expect(mixes.length).toBeGreaterThan(3);
    expect(Math.max(...mixes)).toBeLessThan(1);
    mixes.length = 0;
    renderer.showLook(null, true); renderer.draw(restHead(), 1000);
    expect(mixes).toEqual([]);
    spy.mockRestore();
  });
  test("an eye whose expression squints keeps still; layers that differ from the rig are refused", () => {
    const { gl, renderer } = make();
    renderer.addLook(look([false, true]));
    renderer.showLook("happy", true);
    renderer.draw({ ...restHead(), gazeX: 1, gazeY: 1 }, 0);
    const state = gl.uniformValue("uEyeState")!;
    expect([Math.abs(state[2]), Math.abs(state[3])]).toEqual([0, 0]);
    expect(state[6]).not.toBe(0);
    const bad = look();
    expect(() => renderer.addLook({ ...bad, name: "angry", layers: bad.layers.map((layer) => layer.name === "base" ? { ...layer, rect: [1, 0, layer.rect[2] - 1, layer.rect[3]] } : layer) })).toThrow(/differ from the rig/);
    renderer.showLook("angry", true);
    expect(renderer.shownLook()).toBe("happy");
  });
});
