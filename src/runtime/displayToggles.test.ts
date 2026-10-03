import { parseStoryV2 } from "@engine/index";
import { defaultPresenceSettings, presenceShown, PRESENCE_TOGGLES, sanitizePresenceSettings, shownFor, STORY_TOGGLE_KEYS, type PresenceToggle } from "./displayToggles";
import { defaultGlobalSettings, sanitizeGlobalSettings } from "./settingsModel";

const TRUTH_TABLE: Array<{ story: boolean | undefined; install: boolean; shown: boolean }> = [
  { story: true, install: true, shown: true },
  { story: true, install: false, shown: false },
  { story: false, install: true, shown: false },
  { story: false, install: false, shown: false },
  { story: undefined, install: true, shown: true },
  { story: undefined, install: false, shown: false },
];

const install = (toggle: PresenceToggle, on: boolean) => ({ ...defaultPresenceSettings(), [toggle]: on });

describe("v2.7 06 per-story toggles: shown = story AND install, absent story key = on", () => {
  it.each(PRESENCE_TOGGLES.flatMap((toggle) => TRUTH_TABLE.map((row) => ({ toggle, ...row }))))(
    "$toggle: story $story, install $install -> $shown",
    ({ toggle, story, install: installOn, shown }) => {
      const display = story === undefined ? {} : { [STORY_TOGGLE_KEYS[toggle]]: story };
      expect(shownFor(display, install(toggle, installOn), toggle)).toBe(shown);
      expect(presenceShown(display, install(toggle, installOn))[toggle]).toBe(shown);
    },
  );

  it("the named case: a story that switches an item on cannot override the player's install-wide off", () => {
    for (const toggle of PRESENCE_TOGGLES) expect(shownFor({ [STORY_TOGGLE_KEYS[toggle]]: true }, install(toggle, false), toggle)).toBe(false);
  });

  it("a story without a display block shows everything the install shows", () => {
    expect(presenceShown(undefined, defaultPresenceSettings())).toEqual(Object.fromEntries(PRESENCE_TOGGLES.map((toggle) => [toggle, true])));
    expect(presenceShown(null, { ...defaultPresenceSettings(), wand: false }).wand).toBe(false);
  });

  it("install-wide defaults are all on and survive the settings sanitizer", () => {
    expect(defaultGlobalSettings().display.presence).toEqual(defaultPresenceSettings());
    expect(sanitizeGlobalSettings({ display: { presence: { listBadges: false, wand: "no" } } }).display.presence).toEqual({ ...defaultPresenceSettings(), listBadges: false });
    expect(sanitizePresenceSettings(null)).toEqual(defaultPresenceSettings());
  });
});

describe("v2.7 06 story display keys", () => {
  const base = {
    format: 2, title: "T", description: "d", qualities: [], roster: [], transitions: [],
    checkpoints: [{ id: "a", name: "A", objective: "o", type: "anchor", start: true }],
  };

  it("accepts each toggle as a boolean and keeps only what the author set", () => {
    const parsed = parseStoryV2({ ...base, display: { continue_list: false, roll_chips: true } });
    expect(Array.isArray(parsed) ? parsed : parsed.display).toEqual({ continue_list: false, roll_chips: true });
  });

  it("refuses a toggle that is not a boolean, naming the key", () => {
    const parsed = parseStoryV2({ ...base, display: { wand: "off" } });
    expect(Array.isArray(parsed) ? parsed.map((error) => error.path) : []).toContain("display.wand");
  });
});
