import {
  LORE_GENERATION_TRIGGERS, LORE_KEY_LOGIC_CODE, LORE_KEY_LOGICS, WI_POSITION_OUTLET, isLoreKeyLogic, looksLikeRegexKey, outletNameProblem, parseKeyRegex, regexKeyProblem,
  triggerGenerationType,
} from "./wiKeys";

describe("wiKeys mirrors ST's lorebook vocabulary", () => {
  it("parses a key the way parseRegexFromString does: delimiters, flags, escaped slashes (world-info.js:2901-2926)", () => {
    expect(parseKeyRegex("/harbou?r/i")).toMatchObject({ source: "harbou?r", flags: "i" });
    expect(parseKeyRegex("/a\\/b/")?.source).toBe("a\\/b");
    expect(parseKeyRegex("/a/b/")).toBeNull();
    expect(parseKeyRegex("harbour")).toBeNull();
    expect(parseKeyRegex("/harbour/x")).toBeNull();
    expect(parseKeyRegex("/(unclosed/")).toBeNull();
  });

  it("names the four secondary logics with ST's codes (world-info.js:33-38)", () => {
    expect(LORE_KEY_LOGICS.map((logic) => LORE_KEY_LOGIC_CODE[logic])).toEqual([0, 1, 2, 3]);
    expect(LORE_KEY_LOGIC_CODE).toEqual({ "and-any": 0, "not-all": 1, "not-any": 2, "and-all": 3 });
    expect(isLoreKeyLogic("not-any")).toBe(true);
    expect(isLoreKeyLogic("NOT_ANY")).toBe(false);
  });

  it("lists the generation types an entry may name, in ST's order (constants.js:36-43)", () => {
    expect([...LORE_GENERATION_TRIGGERS]).toEqual(["normal", "continue", "impersonate", "swipe", "regenerate", "quiet"]);
  });

  it("maps a Generate type to the scan's trigger: an unlisted type is normal, none is unknown (script.js:4633)", () => {
    expect([triggerGenerationType("swipe"), triggerGenerationType("appendFinal"), triggerGenerationType(undefined)]).toEqual(["swipe", "normal", null]);
  });

  it("places an outlet entry at position 7 (world-info.js:863)", () => {
    expect(WI_POSITION_OUTLET).toBe(7);
  });

  it("refuses an outlet name the {{outlet::name}} macro could not read back (macros.js:668)", () => {
    expect(outletNameProblem("map")).toBeNull();
    expect(outletNameProblem("map}}")).toContain("outlet name");
    expect(outletNameProblem("{{map")).toContain("outlet name");
  });

  it("flags only a key that looks like a pattern but ST would read as plain text (world-info.js:2909-2919)", () => {
    expect(looksLikeRegexKey("/a/b/i")).toBe(true);
    expect(looksLikeRegexKey("harbour")).toBe(false);
    expect(regexKeyProblem("/a/b/i")).toContain("plain text");
    expect(regexKeyProblem("/(unclosed/i")).toContain("plain text");
    expect([regexKeyProblem("/harbou?r/i"), regexKeyProblem("harbour"), regexKeyProblem("/")]).toEqual([null, null, null]);
  });
});
