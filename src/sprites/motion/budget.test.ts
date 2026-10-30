import { REDUCED_MS, stageMotion, type MotionSwitches } from "./budget";
import { defaultSpriteSettings, sanitizeSpriteSettings } from "../settings";

const on: MotionSwitches = { effects: "full", hostReduced: false, osReduced: false, storyMotion: true };

describe("stage motion budget", () => {
  it("defaults to full with comic touches on", () => {
    expect(defaultSpriteSettings().effects).toBe("full");
    const full = stageMotion(on);
    expect(full).toMatchObject({ mode: "full", enter: "rise", hop: true, reactions: true, idle: true, blurOthers: true, punch: "shake", transitions: "authored" });
  });

  it("calm keeps fades, transitions, vignette and the chapter card, and drops hops, reactions, idle beats and the shake", () => {
    expect(stageMotion({ ...on, effects: "calm" })).toMatchObject({ mode: "calm", enter: "fade", hop: false, reactions: false, idle: false, blurOthers: false,
      punch: "flash", vignette: true, chapterCard: true, transitions: "authored" });
  });

  it("off plays nothing, even with reduced motion switches set", () => {
    for (const reduced of [false, true]) {
      expect(stageMotion({ ...on, effects: "off", hostReduced: reduced })).toMatchObject({ mode: "off", enter: "none", vignette: false, chapterCard: false, transitions: "none", punch: "none" });
    }
  });

  it("each reduced motion switch wins over full and calm: short opacity-only fades, no movement", () => {
    const cases: MotionSwitches[] = [{ ...on, hostReduced: true }, { ...on, osReduced: true }, { ...on, storyMotion: false }, { ...on, effects: "calm", osReduced: true }];
    for (const switches of cases) {
      const budget = stageMotion(switches);
      expect(budget).toMatchObject({ mode: "reduced", enter: "fade", enterMs: REDUCED_MS, moveMs: 0, hop: false, reactions: false, idle: false, punch: "flash",
        transitions: "opacity", maxTransitionMs: REDUCED_MS });
    }
  });

  it("the setting sanitizes to one of three levels", () => {
    expect(sanitizeSpriteSettings({ effects: "calm" }).effects).toBe("calm");
    expect(sanitizeSpriteSettings({ effects: "off" }).effects).toBe("off");
    expect(sanitizeSpriteSettings({ effects: "loud" }).effects).toBe("full");
  });
});
