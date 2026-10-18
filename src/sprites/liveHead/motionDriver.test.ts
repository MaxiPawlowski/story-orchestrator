import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { restHead, type HeadParameters } from "./drivers";
import { HeadDriver } from "./headDriver";
import { IDLES, MotionDriver, REACTIONS, motionById, reactionFor, sampleTrack, scheduledMotion, type Presence } from "./motionDriver";

const MOTION_KEYS: Array<keyof HeadParameters> = ["breath", "angleX", "angleY", "angleZ", "gazeX", "gazeY", "eyeOpen", "eyeSmile", "mouthOpen", "mouthForm",
  "browY", "browAngle", "blush", "bodyAngleX", "bodyAngleZ", "armAngle", "handAngle", "fingerTap", "hair"];

function trace(seed: string, frames: number, step: number, events: (time: number) => { label: string; presence: Presence; motion: boolean; open?: number }) {
  const head = new HeadDriver(seed), driver = new MotionDriver(seed), rows: number[][] = [], gestures: string[] = [];
  for (let i = 0; i < frames; i++) {
    const time = i * step, event = events(time);
    const p = head.drive(time, event.label, event.presence === "talking", event.motion);
    if (event.open !== undefined) p.mouthOpen = event.open;
    driver.apply(p, time, event.label, event.presence, event.motion);
    rows.push(MOTION_KEYS.map((key) => p[key]));
    if (driver.playing && gestures[gestures.length - 1] !== driver.playing) gestures.push(driver.playing);
  }
  return { rows, gestures };
}

describe("keyframed tracks", () => {
  test("cubic Hermite passes through every key and is flat at both ends", () => {
    const keys = REACTIONS.find((motion) => motion.id === "nod")?.tracks.find((track) => track.key === "angleY")?.keys;
    if (!keys) throw new Error("nod angleY missing");
    for (const [time, value] of keys) expect(sampleTrack(keys, time)).toBeCloseTo(value, 9);
    expect(sampleTrack(keys, -1)).toBe(keys[0][1]);
    expect(sampleTrack(keys, 99)).toBe(keys[keys.length - 1][1]);
    expect(Math.abs(sampleTrack(keys, 0.001) - keys[0][1])).toBeLessThan(0.01);
  });
  test("the ported set holds every upstream reaction except wink and every idle motion, with no mouth-open track", () => {
    expect(REACTIONS.map((motion) => motion.id)).toEqual(["nod", "tilt", "think", "giggle", "surprise", "shy", "no", "greet"]);
    expect(IDLES.map((motion) => motion.id)).toEqual(["lookAround", "glance", "sway", "sigh", "doze", "stretch", "lean", "hum", "tap", "readNote", "waiting", "spaceOut"]);
    for (const motion of [...REACTIONS, ...IDLES]) expect(motion.tracks.some((track) => track.key === "mouthOpen")).toBe(false);
  });
  test("expression labels map to reactions", () => {
    expect(reactionFor("Joy")).toBe("nod");
    expect(reactionFor("amusement")).toBe("giggle");
    expect(reactionFor("surprise")).toBe("surprise");
    expect(reactionFor("sadness")).toBe("sigh");
    expect(reactionFor("anger")).toBe("no");
    expect(reactionFor("embarrassment")).toBe("shy");
    expect(reactionFor("curiosity")).toBe("tilt");
    expect(reactionFor("neutral")).toBeUndefined();
    for (const id of new Set(["joy", "amusement", "sad", "anger", "embarrassment", "curiosity", "thinking"].map(reactionFor))) expect(id && motionById(id)).toBeTruthy();
  });
});

describe("motion driver", () => {
  test("reduced motion leaves every idle parameter unchanged over 10 s (LM3)", () => {
    const { rows } = trace("Wren", 600, 1000 / 60, (time) => ({ label: time > 4000 ? "joy" : "neutral", presence: time > 6000 ? "listening" : "idle", motion: false }));
    const later = rows.slice(250);
    for (const row of later) expect(row).toEqual(later[0]);
    const index = (key: keyof HeadParameters) => MOTION_KEYS.indexOf(key);
    for (const key of ["bodyAngleX", "bodyAngleZ", "armAngle", "handAngle", "fingerTap", "hair"] as const) expect(later[0][index(key)]).toBe(0);
  });

  test("the same seed, clock and events give the same trace (LM7)", () => {
    const events = (time: number) => ({ label: time > 20_000 ? "surprise" : "neutral", presence: (time > 30_000 && time < 40_000 ? "talking" : time > 45_000 ? "listening" : "idle") as Presence,
      motion: true, open: time > 30_000 && time < 40_000 ? Math.abs(Math.sin(time / 90)) * 0.8 : undefined });
    const one = trace("Garrick", 3600, 1000 / 60, events), two = trace("Garrick", 3600, 1000 / 60, events);
    expect(one).toEqual(two);
    expect(trace("Pim", 3600, 1000 / 60, events).rows).not.toEqual(one.rows);
  });

  test("idle plays seeded gestures from the schedule; the schedule is a pure function of seed and time", () => {
    const { gestures } = trace("Wren", 120 * 30, 1000 / 30, () => ({ label: "neutral", presence: "idle", motion: true }));
    expect(gestures.length).toBeGreaterThanOrEqual(3);
    for (const id of gestures) expect(IDLES.some((motion) => motion.id === id)).toBe(true);
    expect(scheduledMotion("Wren", "idle", 50_000)).toEqual(scheduledMotion("Wren", "idle", 50_000));
    expect(scheduledMotion("Wren", "talking", 50_000)).toBeNull();
    const listen = Array.from({ length: 60 }, (_, slot) => scheduledMotion("Wren", "listening", slot * 5000 + 10)).filter(Boolean);
    expect(listen.length).toBeGreaterThan(5);
    for (const entry of listen) expect(entry).toMatchObject({ headOnly: true, gain: 0.5 });
  });

  test("an expression change plays its reaction while idle or listening, never while talking", () => {
    const idle = trace("Pim", 240, 1000 / 60, (time) => ({ label: time >= 1000 ? "joy" : "neutral", presence: "idle", motion: true }));
    expect(idle.gestures).toContain("nod");
    const listening = trace("Pim", 240, 1000 / 60, (time) => ({ label: time >= 1000 ? "anger" : "neutral", presence: "listening", motion: true }));
    expect(listening.gestures).toContain("no");
    const talking = trace("Pim", 240, 1000 / 60, (time) => ({ label: time >= 1000 ? "joy" : "neutral", presence: "talking", motion: true, open: 0.4 }));
    expect(talking.gestures).toEqual([]);
  });

  test("talking nods follow the mouth and no idle gesture starts", () => {
    const { rows, gestures } = trace("Wren", 60 * 40, 1000 / 60, (time) => ({ label: "neutral", presence: "talking", motion: true, open: Math.abs(Math.sin(time / 120)) * 0.9 }));
    expect(gestures).toEqual([]);
    const flat = trace("Wren", 60 * 40, 1000 / 60, () => ({ label: "neutral", presence: "talking", motion: true, open: 0 }));
    const y = MOTION_KEYS.indexOf("angleY");
    const mean = (set: number[][]) => set.reduce((sum, row) => sum + row[y], 0) / set.length;
    expect(mean(rows)).toBeLessThan(mean(flat.rows) - 0.5);
  });

  test("gestures never close the eyes below the floor and never open the mouth", () => {
    const head = new HeadDriver("Wren");
    for (const motion of [...REACTIONS, ...IDLES]) {
      const driver = new MotionDriver("Wren");
      for (let time = 0; time <= motion.dur * 1000; time += 25) {
        const p = head.drive(0, "neutral", false, false);
        if (time === 0) driver.start(motion.id, 0);
        driver.apply(p, time, "neutral", "talking", true);
        expect(p.eyeOpen).toBeGreaterThanOrEqual(0.5 - 1e-9);
        expect(p.mouthOpen).toBe(0);
      }
    }
  });

  test("apply writes into the given parameters and allocates no per-frame parameter object", () => {
    const head = new HeadDriver("Wren"), driver = new MotionDriver("Wren"), seen = new Set<HeadParameters>();
    for (let i = 0; i < 4000; i++) seen.add(driver.apply(head.drive(i * 16, "neutral", false, true), i * 16, "neutral", "idle", true));
    expect(seen.size).toBe(1);
    expect(restHead()).toMatchObject({ bodyAngleX: 0, bodyAngleZ: 0, armAngle: 0, handAngle: 0, fingerTap: 0, hair: 0 });
  });

  test("motion code draws no Math.random", () => {
    for (const file of ["motionDriver.ts", "motionTracks.ts", "hair.ts", "hand.ts"])
      expect(readFileSync(resolve(__dirname, file), "utf8")).not.toMatch(/Math\.random/);
  });
});
