import { INJECTION_REGISTRY, findInjectionRegistryProblems, carriesInto } from "@constants/injectionRegistry";
import { SWIPE_CONTRAST_CLEARS, SWIPE_CONTRAST_CLIP, SWIPE_CONTRAST_LEAD, clipRejected, swipeContrast, swipeContrastText, type SwipeContrastDeps } from "./swipeContrast";
import { sanitizeGlobalSettings } from "./settingsModel";

const rig = (patch: Partial<SwipeContrastDeps> = {}) => {
  const shown: Array<string | null> = [];
  let rejected: string | null = "She shrugs and walks off.";
  const contrast = swipeContrast({
    enabled: () => true, chatId: () => "chat", ownedChat: () => "chat", rejected: () => rejected,
    set: (text) => { shown.push(text); return { ok: true }; }, clear: () => { shown.push(null); }, ...patch,
  });
  return { contrast, shown, reject: (text: string | null) => { rejected = text; } };
};

describe("v3.0 31 S2 swipe contrast", () => {
  test("the switch is off by default (prompt layout waits for its blind rating)", () => {
    expect(sanitizeGlobalSettings(undefined).talk.swipeContrast).toBe(false);
    expect(sanitizeGlobalSettings({ talk: { swipeContrast: true } }).talk.swipeContrast).toBe(true);
  });

  test("the block sits at the tail, withheld from quiet and impersonate runs, and the registry stays clean", () => {
    expect(INJECTION_REGISTRY.swipeContrast.depth).toBe(0);
    expect(carriesInto(INJECTION_REGISTRY.swipeContrast, "quiet")).toBe(false);
    expect(carriesInto(INJECTION_REGISTRY.swipeContrast, "impersonate")).toBe(false);
    expect(findInjectionRegistryProblems()).toEqual([]);
  });

  test("the text leads with the rejection, fences the visible reply and clips it", () => {
    expect(swipeContrastText("Hello there.")).toBe(`${SWIPE_CONTRAST_LEAD}\n\`\`\`\nHello there.\n\`\`\``);
    const long = clipRejected("word ".repeat(400));
    expect(long.length).toBeLessThanOrEqual(SWIPE_CONTRAST_CLIP + 1);
    expect(long.endsWith("…")).toBe(true);
    expect(clipRejected("a ``` b")).toBe("a ''' b");
    expect(swipeContrastText("   ")).toBeNull();
  });

  test("only a loud swipe in the story chat arms it", () => {
    for (const [type, withheld, patch] of [
      ["normal", false, {}], ["regenerate", false, {}], ["quiet", true, {}], ["impersonate", true, {}], ["continue", false, {}],
      ["swipe", false, { ownedChat: () => "other" }], ["swipe", false, { enabled: () => false }], ["swipe", true, {}],
    ] as const) {
      const { contrast, shown } = rig(patch);
      expect([type, contrast.arm(type, withheld)]).toEqual([type, false]);
      expect(shown.filter((text) => text !== null)).toEqual([]);
    }
    const { contrast, shown } = rig();
    expect(contrast.arm("swipe", false)).toBe(true);
    expect(shown).toEqual([swipeContrastText("She shrugs and walks off.")]);
  });

  test.each(SWIPE_CONTRAST_CLEARS.map((event) => [event]))("cleared on %s", (event) => {
    const { contrast, shown } = rig();
    contrast.arm("swipe", false);
    contrast.onEvent(event, false);
    expect(contrast.armed()).toBe(false);
    expect(shown.at(-1)).toBeNull();
    contrast.onEvent(event, false);
    expect(shown.filter((text) => text === null).length).toBe(1);
  });

  test("a dry-run prompt build does not clear it; the next generation of any kind does", () => {
    const { contrast } = rig();
    contrast.arm("swipe", false);
    contrast.onEvent("GENERATE_AFTER_DATA", true);
    expect(contrast.armed()).toBe(true);
    contrast.onEvent("GENERATION_STARTED");
    expect(contrast.armed()).toBe(false);
  });

  test("a second swipe quotes the newest rejected reply only", () => {
    const { contrast, shown, reject } = rig();
    contrast.arm("swipe", false);
    reject("A second try.");
    contrast.arm("swipe", false);
    expect(shown.filter((text): text is string => text !== null).at(-1)).toContain("A second try.");
    expect(shown.filter((text): text is string => text !== null).at(-1)).not.toContain("She shrugs");
  });

  test("nothing to quote arms nothing, and a refused write arms nothing", () => {
    const empty = rig();
    empty.reject(null);
    expect(empty.contrast.arm("swipe", false)).toBe(false);
    expect(rig({ set: () => ({ ok: false }) }).contrast.arm("swipe", false)).toBe(false);
  });
});
