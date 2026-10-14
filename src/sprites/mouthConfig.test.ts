import { DEFAULT_MOUTH_CONFIG, mouthConfig } from "./mouthConfig";
import { MouthStepper, mouthShape, shapeFrame, withVisemeMouth } from "./mouthShape";
import { TextMouth, timedTrack } from "./lipsync/textMouth";
import { restHead } from "./liveHead/drivers";
import { DrawnDirector, type DrawnName } from "./liveHead/drawn";
import { MeshMouth, meshMouthMode } from "./liveHead/meshMouth";
import { syntheticHead } from "./liveHead/synthetic";

const rig = syntheticHead.rig;
const say = (open: number, form: number) => ({ open, form, viseme: "x" });
const all = new Set<DrawnName>(["eyes_closed_0", "eyes_closed_1", "mouth_talk", "mouth_talk2", "mouth_o", "mouth_wide"]);

describe("mouth behaviour config", () => {
  test("the product default is one frozen-in-shape object and patches never mutate it", () => {
    const patched = mouthConfig({ holdMs: 0, mesh: { openMax: 0.3 }, drawn: { crossfadeMs: 80 } });
    expect(patched.mesh.openGain).toBe(DEFAULT_MOUTH_CONFIG.mesh.openGain);
    expect([patched.holdMs, patched.mesh.openMax, patched.drawn.crossfadeMs]).toEqual([0, 0.3, 80]);
    expect([DEFAULT_MOUTH_CONFIG.holdMs, DEFAULT_MOUTH_CONFIG.mesh.openMax, DEFAULT_MOUTH_CONFIG.drawn.crossfadeMs]).toEqual([60, 0.15, 0]);
  });
  test("threshold, hysteresis, hold, grouping and the frame table are read from the config", () => {
    const loose = mouthConfig({ openMin: 0.3, openPad: 0.2 });
    expect(mouthShape(0.2, 0, null)).toBe("aHalf");
    expect(mouthShape(0.2, 0, null, loose)).toBeNull();
    expect(mouthShape(0.15, 0, "aHalf", loose)).toBe("aHalf");
    const swapped = mouthConfig({ chains: { ...DEFAULT_MOUTH_CONFIG.chains, o: ["talk2", "talk", "mouth_o", "mouth_wide"] } });
    expect(shapeFrame("o", { talk: "/a", talk2: "/b", mouth_o: "/o" }, swapped)).toBe("talk2");
    const grouped = mouthConfig({ regions: [["i", -9, 0], ["a", 0, 9]] });
    expect(mouthShape(0.9, -0.3, null, grouped)).toBe("i");
    const stepper = new MouthStepper(mouthConfig({ holdMs: 200 }));
    expect(stepper.next(say(0.9, 0), { talk: "/a", talk2: "/b" }, 0)).toBe("talk");
    expect(stepper.next(say(0.4, 0), { talk: "/a", talk2: "/b" }, 150)).toBe("talk");
    expect(stepper.next(say(0.4, 0), { talk: "/a", talk2: "/b" }, 200)).toBe("talk2");
    expect(withVisemeMouth({ mouthOpen: 0, mouthForm: 1 }, say(0.5, 0), mouthConfig({ visemeFormShare: 1 })).mouthForm).toBe(0);
  });
  test("timing source: per word follows the viseme rules, per syllable keeps one cue per vowel, per character one per letter", () => {
    expect(timedTrack("hello", "word").visemes.length).toBeGreaterThan(timedTrack("hello", "syllable").visemes.length);
    expect(timedTrack("hello", "syllable").visemes.every((viseme) => ["aa", "E", "EE", "I", "O", "U"].includes(viseme))).toBe(true);
    expect(timedTrack("hello", "character").visemes).toEqual(["kk", "E", "nn", "nn", "O"]);
    const word = timedTrack("strength", "syllable");
    expect(word.times[0]).toBe(0);
    expect(word.times.at(-1)! + word.durations.at(-1)!).toBe(timedTrack("strength", "word").times.at(-1)! + timedTrack("strength", "word").durations.at(-1)!);
    const mouth = new TextMouth("", mouthConfig({ timing: "character", visemes: { ...DEFAULT_MOUTH_CONFIG.visemes, O: { open: 0.2, form: 0.6 } } }));
    mouth.push("go ", 0);
    const samples = Array.from({ length: 40 }, (_, index) => mouth.sample(index * 10)).filter((sample) => sample?.viseme === "O");
    expect(samples.length).toBeGreaterThan(0);
    expect(Math.min(...samples.map((sample) => sample!.open))).toBeCloseTo(0.2, 5);
  });
  test("mesh, drawn and hybrid styles pick the mesh mouth under drawn frames; amplitude and smoothing come from the config", () => {
    expect(["auto", "mesh", "drawn", "hybrid"].map((style) => meshMouthMode(rig, true, mouthConfig({ style: style as "auto" })))).toEqual(["full", "capped", "still", "hybrid"]);
    expect(meshMouthMode(rig, false, mouthConfig({ style: "drawn" }))).toBe("capped");
    const p = { ...restHead(), mouthOpen: 0.9 };
    expect(new MeshMouth("hybrid").apply(p, 0).mouthOpen).toBe(DEFAULT_MOUTH_CONFIG.hybrid.openMax);
    expect(new MeshMouth("capped", mouthConfig({ mesh: { openMax: 0.4, openGain: 1 } })).apply(p, 0).mouthOpen).toBe(0.4);
    expect(new MeshMouth("capped", mouthConfig({ mesh: { attackMs: 0 } })).apply(p, 16).mouthOpen).toBe(0.15);
    expect(new DrawnDirector(all, mouthConfig({ style: "mesh" })).update({ ...p }, 16)).toMatchObject({ mouth: null, shaderMouth: 0.9 });
  });
  test("crossfade and hold between drawn frames: the old frame fades out while the new one fades in", () => {
    const director = new DrawnDirector(all, mouthConfig({ drawn: { crossfadeMs: 80 } }));
    director.update({ ...restHead(), mouthOpen: 0.9 }, 16);
    const switched = director.update({ ...restHead(), mouthOpen: 0.5, mouthForm: -0.85 }, 40);
    expect(switched).toMatchObject({ mouth: "mouth_wide", mouthFrom: "mouth_talk" });
    expect(switched.mouthAlpha + switched.mouthFromAlpha).toBeCloseTo(1, 10);
    expect(switched.mouthAlpha).toBeGreaterThan(0); expect(switched.mouthFromAlpha).toBeGreaterThan(0);
    expect(director.update({ ...restHead(), mouthOpen: 0.5, mouthForm: -0.85 }, 40)).toMatchObject({ mouth: "mouth_wide", mouthFrom: null, mouthAlpha: 1 });
    const holding = new DrawnDirector(all, mouthConfig({ drawn: { holdMs: 100 } }));
    holding.update({ ...restHead(), mouthOpen: 0.9 }, 16);
    expect(holding.update({ ...restHead(), mouthOpen: 0.5, mouthForm: -0.85 }, 50).mouth).toBe("mouth_talk");
    expect(holding.update({ ...restHead(), mouthOpen: 0.5, mouthForm: -0.85 }, 60).mouth).toBe("mouth_wide");
    expect(new DrawnDirector(all).update({ ...restHead(), mouthOpen: 0.9 }, 16)).toMatchObject({ mouthFrom: null, mouthFromAlpha: 0 });
  });
});
