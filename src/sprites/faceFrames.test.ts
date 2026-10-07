import { decodeFrames, FRAME_BYTES_PER_ACTOR, frameBudget, FrameMemory, startBlink, startMouth } from "./faceFrames";
import { blinkGap } from "./animation";

const MB = 1024 * 1024;
const FRAMES = { talk: "/a/happy.talk.png", talk2: "/a/happy.talk2.png", blink: "/a/happy.blink.png" };
const big = async () => ({ width: 1024, height: 2048 });

describe("frame memory", () => {
  it("sizes the cap from the cast: five animated actors at 8 MB a frame all keep their frames", async () => {
    const memory = new FrameMemory(() => undefined);
    const budget = frameBudget(5);
    const loaded = await Promise.all([0, 1, 2, 3, 4].map((actor) => decodeFrames(FRAMES, `actor-${actor}`, budget, memory, big, () => true, [])));
    expect(loaded.every((frames) => frames && Object.keys(frames).length === 3)).toBe(true);
    expect(memory.used()).toBe(5 * 3 * 8 * MB);
  });

  it("control: the old fixed 64 MB cap drops the fourth and fifth actors' frames", async () => {
    const memory = new FrameMemory(() => undefined);
    const loaded = await Promise.all([0, 1, 2, 3, 4].map((actor) => decodeFrames(FRAMES, `actor-${actor}`, 64 * MB, memory, big, () => true, [])));
    expect(loaded.filter((frames) => frames && Object.keys(frames).length < 3).length).toBeGreaterThan(0);
  });

  it("never sizes below 64 MB or above 256 MB", () => {
    expect(frameBudget(0)).toBe(64 * MB);
    expect(frameBudget(4)).toBe(4 * FRAME_BYTES_PER_ACTOR);
    expect(frameBudget(40)).toBe(256 * MB);
  });

  it("logs once when a frame is dropped, and releasing frees the room", async () => {
    const warnings: string[] = [];
    const memory = new FrameMemory((message) => warnings.push(message));
    const held: string[] = [];
    await decodeFrames(FRAMES, "a", 16 * MB, memory, big, () => true, held);
    await decodeFrames(FRAMES, "b", 16 * MB, memory, big, () => true, []);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/16 MB/);
    held.forEach((key) => memory.release(key));
    expect(memory.used()).toBe(0);
  });

  it("stops when the face unmounts mid-decode and keeps nothing", async () => {
    const memory = new FrameMemory(() => undefined);
    let live = true;
    const decode = async () => { live = false; return { width: 10, height: 10 }; };
    expect(await decodeFrames(FRAMES, "a", frameBudget(1), memory, decode, () => live, [])).toBeNull();
    expect(memory.used()).toBe(0);
  });

  it("skips a frame that fails to decode and keeps the others", async () => {
    const memory = new FrameMemory(() => undefined);
    const decode = async (path: string) => { if (path.includes("talk2")) throw new Error("broken"); return { width: 10, height: 10 }; };
    expect(await decodeFrames(FRAMES, "a", frameBudget(1), memory, decode, () => true, [])).toEqual({ talk: FRAMES.talk, blink: FRAMES.blink });
  });
});

describe("face timers", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("blinks after the seeded gap for 140 ms, then waits the next gap; stopping hides the lid", () => {
    const lid = { style: { opacity: "0" } };
    const stop = startBlink(lid, "seed");
    jest.advanceTimersByTime(blinkGap("seed", 0) - 1);
    expect(lid.style.opacity).toBe("0");
    jest.advanceTimersByTime(1);
    expect(lid.style.opacity).toBe("1");
    jest.advanceTimersByTime(140);
    expect(lid.style.opacity).toBe("0");
    jest.advanceTimersByTime(blinkGap("seed", 1));
    expect(lid.style.opacity).toBe("1");
    stop();
    expect(lid.style.opacity).toBe("0");
    jest.advanceTimersByTime(20_000);
    expect(lid.style.opacity).toBe("0");
  });

  it("steps the mouth through its sequence every 110 ms and closes it on stop", () => {
    const mouth = { src: "", style: { opacity: "0" } };
    const stop = startMouth(mouth, [null, "/open.png"]);
    jest.advanceTimersByTime(110);
    expect(mouth.style.opacity).toBe("0");
    jest.advanceTimersByTime(110);
    expect({ src: mouth.src, opacity: mouth.style.opacity }).toEqual({ src: "/open.png", opacity: "1" });
    stop();
    expect(mouth.style.opacity).toBe("0");
    expect(jest.getTimerCount()).toBe(0);
  });

  it("a one-frame sequence never starts a timer", () => {
    const mouth = { src: "", style: { opacity: "0" } };
    startMouth(mouth, [null]);
    expect(jest.getTimerCount()).toBe(0);
  });
});
