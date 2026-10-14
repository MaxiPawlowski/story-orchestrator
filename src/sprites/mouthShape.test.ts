import { classifyVowel, MouthStepper, mouthShape, shapeFrame, withVisemeMouth, type MouthSample } from "./mouthShape";
import { DEFAULT_MOUTH_CONFIG } from "./mouthConfig";
import { startVisemeMouth } from "./faceFrames";
import { StreamActivity, type TextMouthEngine } from "./animation";

const say = (open: number, form: number, viseme = "x"): MouthSample => ({ open, form, viseme });
const three = { talk: "/open.png", talk2: "/half.png" }, two = { talk: "/open.png" };

describe("vowel hysteresis (mesh-avatar-studio classifyVowel port)", () => {
  it("keeps the previous vowel while the form hovers just past a boundary", () => {
    expect(classifyVowel(-0.58, null)).toBe("i");
    expect(classifyVowel(-0.58, "e")).toBe("e");
    expect(classifyVowel(-0.7, "e")).toBe("i");
    expect(classifyVowel(0.38, "aHalf")).toBe("a");
    expect(classifyVowel(0.38, null)).toBe("o");
  });

  it("opens and widens the mouth with a little hysteresis too", () => {
    expect(mouthShape(0.14, 0, null)).toBeNull();
    expect(mouthShape(0.14, 0, "aHalf")).toBe("aHalf");
    expect(mouthShape(0.1, 0, "aHalf")).toBeNull();
    expect(mouthShape(0.58, 0, null)).toBe("aHalf");
    expect(mouthShape(0.58, 0, "a")).toBe("a");
    expect(mouthShape(0.9, -0.85, null)).toBe("i");
  });

  it("maps shapes onto the sprite's frames: half shapes use talk2, a set without it uses talk", () => {
    expect(shapeFrame("a", three)).toBe("talk");
    expect(shapeFrame("o", three)).toBe("talk");
    expect(["aHalf", "e", "i", "u"].map((shape) => shapeFrame(shape as "e", three))).toEqual(["talk2", "talk2", "talk2", "talk2"]);
    expect(shapeFrame("i", two)).toBe("talk");
    expect(shapeFrame("a", {})).toBeNull();
    expect(shapeFrame(null, three)).toBeNull();
  });
});

describe("drawn mouth shapes beyond talk and talk2", () => {
  const five = { ...three, mouth_o: "/oh.png", mouth_wide: "/ee.png" };
  it("maps every viseme group onto its own frame when all four mouths exist", () => {
    expect((["a", "aHalf", "e", "i", "o", "u"] as const).map((shape) => shapeFrame(shape, five))).toEqual(["talk", "talk2", "talk2", "mouth_wide", "mouth_o", "mouth_o"]);
  });
  it("falls back to the nearest available frame, and to no frame (the capped mesh) when no mouth is drawn", () => {
    expect(shapeFrame("o", { ...three, mouth_wide: "/ee.png" })).toBe("talk");
    expect(shapeFrame("i", { ...three, mouth_o: "/oh.png" })).toBe("talk2");
    expect(shapeFrame("e", { talk: "/open.png", mouth_wide: "/ee.png" })).toBe("mouth_wide");
    expect(shapeFrame("a", { mouth_o: "/oh.png" })).toBe("mouth_o");
    expect(shapeFrame("u", { talk2: "/half.png" })).toBe("talk2");
    expect(shapeFrame("i", { blink: "/b.png" } as never)).toBeNull();
  });
  it("keeps hysteresis and the minimum hold across the new frames, and talk plus any other mouth leaves the talk-only vowel gate", () => {
    const stepper = new MouthStepper();
    expect(stepper.next(say(0.75, 0.6, "O"), five, 0)).toBe("mouth_o");
    expect(stepper.next(say(0.5, -0.85, "I"), five, 30)).toBe("mouth_o");
    expect(stepper.next(say(0.5, -0.85, "I"), five, 61)).toBe("mouth_wide");
    expect(stepper.next(say(0.5, -0.58, "I"), five, 130)).toBe("mouth_wide");
    const gated = new MouthStepper(DEFAULT_MOUTH_CONFIG, 0);
    expect(gated.next(say(0.3, -0.3, "DD"), { talk: "/open.png", mouth_o: "/oh.png" }, 0)).toBe("talk");
  });
});

describe("mouth stepper", () => {
  it("holds a frame for at least 60 ms so a hovering sample cannot flicker", () => {
    const stepper = new MouthStepper();
    expect(stepper.next(say(0.9, 0), three, 0)).toBe("talk");
    expect(stepper.next(say(0.3, -0.4), three, 20)).toBe("talk");
    expect(stepper.next(say(0.9, 0), three, 40)).toBe("talk");
    expect(stepper.next(say(0.5, -0.85), three, 70)).toBe("talk2");
    expect(stepper.next(null, three, 100)).toBe("talk2");
    expect(stepper.next(null, three, 140)).toBeNull();
  });

  it("opens a two-frame mouth only on vowels, with open/close hysteresis", () => {
    const stepper = new MouthStepper(DEFAULT_MOUTH_CONFIG, 0);
    expect(stepper.next(say(0.3, -0.3, "DD"), two, 0)).toBeNull();
    expect(stepper.next(say(0.9, 0, "aa"), two, 10)).toBe("talk");
    expect(stepper.next(say(0.4, 0.9, "U"), two, 20)).toBe("talk");
    expect(stepper.next(say(0.3, -0.3, "DD"), two, 30)).toBeNull();
    expect(stepper.next(say(0.4, 0.9, "U"), two, 40)).toBeNull();
  });

  it("feeds the live head's mouthOpen and mouthForm without touching other parameters", () => {
    const head = { mouthOpen: 0.3, mouthForm: -0.4, eyeOpen: 1 };
    expect(withVisemeMouth(head, undefined)).toBe(head);
    expect(withVisemeMouth(head, null)).toEqual({ mouthOpen: 0, mouthForm: -0.4, eyeOpen: 1 });
    const speaking = withVisemeMouth(head, say(0.75, 0.6));
    expect(speaking.mouthOpen).toBe(0.75);
    expect(speaking.mouthForm).toBeCloseTo(0.2);
    expect(speaking.eyeOpen).toBe(1);
  });
});

describe("streamed-mouth animator", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("steps frames from visemes, and flaps until the lip-sync chunk is ready", () => {
    let now = 0, sample: MouthSample | null | undefined;
    const mouth = { src: "", style: { opacity: "0" } };
    const stop = startVisemeMouth(mouth, three, () => sample, [null, "/open.png"], () => now);
    sample = undefined;
    now = 130; jest.advanceTimersByTime(30);
    expect(mouth).toEqual({ src: "/open.png", style: { opacity: "1" } });
    sample = say(0.5, -0.85); now = 300; jest.advanceTimersByTime(30);
    expect(mouth).toEqual({ src: "/half.png", style: { opacity: "1" } });
    sample = null; now = 400; jest.advanceTimersByTime(30);
    expect(mouth.style.opacity).toBe("0");
    stop();
    expect(mouth.style.opacity).toBe("0");
  });

  it("does nothing for a label without a talk frame", () => {
    const mouth = { src: "", style: { opacity: "0" } };
    startVisemeMouth(mouth, {}, () => say(0.9, 0), [null], () => 0);
    jest.advanceTimersByTime(300);
    expect(mouth.style.opacity).toBe("0");
  });
});

describe("stream activity: text lip-sync", () => {
  const recorder = () => {
    const pushes: Array<{ spoken: string; text: string; now: number }> = [];
    const factory = (spoken: string): TextMouthEngine => ({
      push: (text, now) => { pushes.push({ spoken, text, now }); },
      sample: (now) => say(0.9, 0, `t${now}`),
    });
    return { pushes, factory };
  };

  it("reports no sample until the chunk loads, then samples only the speaker", async () => {
    let now = 5;
    const activity = new StreamActivity(() => now), { pushes, factory } = recorder();
    activity.pulse("Ann", "Hel");
    expect(activity.mouth("Ann")).toBeUndefined();
    await activity.visemes(async () => factory);
    now = 10; activity.pulse("Ann", "Hello");
    expect(pushes).toEqual([{ spoken: "Hel", text: "Hello", now: 10 }]);
    expect(activity.mouth("Ann", 12)?.viseme).toBe("t12");
    expect(activity.mouth("Bea", 12)).toBeNull();
    activity.pulse("Bea", "Hi");
    expect(pushes[1]).toEqual({ spoken: "", text: "Hi", now: 10 });
    activity.stop();
    expect(activity.mouth("Bea")).toBeNull();
  });

  it("keeps flapping when the chunk fails to load", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const activity = new StreamActivity();
    await activity.visemes(async () => { throw new Error("offline"); });
    activity.pulse("Ann", "Hello");
    expect(activity.mouth("Ann")).toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    activity.stop();
    warn.mockRestore();
  });
});
