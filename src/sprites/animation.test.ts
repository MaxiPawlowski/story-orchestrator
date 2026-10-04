import { blinkGap, frameIndex, mouthSequence, StreamActivity } from "./animation";

test("frame listing reads suffixes independently of ST's collapsed expression label", () => {
  const frames = frameIndex([{ path: "/characters/Test/anim-default/happy.blink.png?t=1" }, { path: "/characters/Test/happy.png" },
    { path: "/characters/Test/anim-default/happy.talk.png" }, { path: "/characters/Test/anim-default/happy.talk2.png" }]);
  expect(Object.keys(frames.get("happy") ?? {})).toEqual(["blink", "talk", "talk2"]);
});

test("all mouth modes degrade safely as frames disappear", () => {
  expect(mouthSequence("off", { talk: "open", talk2: "half" })).toEqual([null]);
  expect(mouthSequence("smooth", { talk: "open", talk2: "half" })).toEqual([null, "half", "open", "half", null]);
  expect(mouthSequence("smooth", { talk: "open" })).toEqual([null, "open"]);
  expect(mouthSequence("smooth", { talk2: "half" })).toEqual([null]);
  expect(mouthSequence("simple", { talk: "open", talk2: "half" })).toEqual([null, "open"]);
  expect(blinkGap("a", 1)).toBe(blinkGap("a", 1));
  expect(blinkGap("a", 1)).not.toBe(blinkGap("b", 1));
});

test("stream activity expires after token silence and explicit stop", () => {
  jest.useFakeTimers();
  const activity = new StreamActivity(), listener = jest.fn();
  activity.subscribe(listener);
  activity.pulse("Test"); jest.advanceTimersByTime(200); activity.pulse("Test");
  expect(listener).toHaveBeenCalledTimes(1);
  jest.advanceTimersByTime(299); expect(activity.view()).toBe("Test");
  jest.advanceTimersByTime(1); expect(activity.view()).toBeNull();
  activity.pulse("Test"); activity.stop(); expect(activity.view()).toBeNull();
  jest.useRealTimers();
});
