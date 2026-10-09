import type { HostScannableEntry } from "@services/STAPI";
import { aboutMember, keywordWillActivate, leftToScan, matchKey, parseKeyRegex, type ScanBufferView } from "./loreKeyMatch";

const buffer = (messages: string[], patch: Partial<ScanBufferView> = {}): ScanBufferView => ({ messages, depth: 2, caseSensitive: false, matchWholeWords: true, ...patch });
const entry = (key: string[], patch: Partial<HostScannableEntry> = {}): HostScannableEntry => ({ world: "Lore", uid: 1, comment: "c", content: "text", key, ...patch });
const scan = buffer(["Max: the harbour lights are out", "Mara: Café du Port is closed", "Arin: an old talk about the lighthouse"]);

describe("matchKey follows ST's matchKeys (world-info.js:337-366)", () => {
  it("whole words: one word needs a boundary, several words are a plain substring", () => {
    const options = { caseSensitive: false, matchWholeWords: true };
    expect(matchKey("\x01the harbourmaster", "harbour", options)).toBe(false);
    expect(matchKey("\x01the harbour, then", "harbour", options)).toBe(true);
    expect(matchKey("\x01dark sinews", "dark sin", options)).toBe(true);
  });

  it("case follows the setting; a regex key keeps its own flags and ignores both settings", () => {
    expect(matchKey("\x01The Harbour", "harbour", { caseSensitive: true, matchWholeWords: false })).toBe(false);
    expect(matchKey("\x01The Harbour", "harbour", { caseSensitive: false, matchWholeWords: false })).toBe(true);
    expect(matchKey("\x01The Harbour", "/harbou?r/", { caseSensitive: false, matchWholeWords: true })).toBe(false);
    expect(matchKey("\x01The Harbour", "/harbou?r/i", { caseSensitive: false, matchWholeWords: true })).toBe(true);
  });

  it("an unescaped slash inside the pattern makes the key plaintext", () => {
    expect(parseKeyRegex("/a/b/")).toBeNull();
    expect(parseKeyRegex("/a\\/b/")?.source).toBe("a\\/b");
  });
});

describe("keywordWillActivate: only when ST's scan is certain to activate the entry", () => {
  it("a primary key inside the scan depth activates; one past the depth does not", () => {
    expect(keywordWillActivate(entry(["harbour"]), scan)).toBe(true);
    expect(keywordWillActivate(entry(["lighthouse"]), scan)).toBe(false);
    expect(keywordWillActivate(entry(["lighthouse"], { scanDepth: 3 }), scan)).toBe(true);
  });

  it("Include Names puts the speaker's name in the buffer", () => {
    expect(keywordWillActivate(entry(["Mara"]), scan)).toBe(true);
  });

  it("depth 0 matches nothing", () => {
    expect(keywordWillActivate(entry(["harbour"], { scanDepth: 0 }), scan)).toBe(false);
    expect(keywordWillActivate(entry(["harbour"]), { ...scan, depth: 0 })).toBe(false);
  });

  it("applies the four secondary-key logics only when the entry is selective", () => {
    const secondary = (selectiveLogic: number, keysecondary: string[]) => keywordWillActivate(entry(["harbour"], { selective: true, selectiveLogic, keysecondary }), scan);
    expect([secondary(0, ["dragon", "lights"]), secondary(0, ["dragon"])]).toEqual([true, false]);
    expect([secondary(1, ["lights", "dragon"]), secondary(1, ["lights"])]).toEqual([true, false]);
    expect([secondary(2, ["dragon"]), secondary(2, ["lights"])]).toEqual([true, false]);
    expect([secondary(3, ["lights", "out"]), secondary(3, ["lights", "dragon"])]).toEqual([true, false]);
    expect(keywordWillActivate(entry(["harbour"], { selective: false, keysecondary: ["dragon"] }), scan)).toBe(true);
  });

  it.each([
    ["a probability below 100", { probability: 50 }],
    ["an inclusion group", { group: "ports" }],
    ["a character filter", { characterFilter: { names: ["mara"], tags: [], isExclude: false } }],
    ["generation triggers", { triggers: ["normal"] }],
    ["a delay", { delay: 3 }],
    ["a cooldown", { cooldown: 2 }],
    ["delay until recursion", { delayUntilRecursion: true }],
    ["a decorator", { content: "@@dont_activate\ntext" }],
    ["a macro in a key", { key: ["{{char}}"] }],
    ["disabled", { disable: true }],
    ["constant", { constant: true }],
  ] as Array<[string, Partial<HostScannableEntry>]>)("is never certain with %s", (_label, patch) => {
    expect(keywordWillActivate(entry(["harbour"], patch), scan)).toBe(false);
  });

  it("control: probability off, or 100, is still certain", () => {
    expect(keywordWillActivate(entry(["harbour"], { probability: 50, useProbability: false }), scan)).toBe(true);
    expect(keywordWillActivate(entry(["harbour"], { probability: 100 }), scan)).toBe(true);
  });
});

describe("aboutMember and leftToScan", () => {
  it("matches a primary key equal to one of the member's names, folded", () => {
    expect(aboutMember(entry([" arin "]), ["Arin"])).toBe(true);
    expect(aboutMember(entry(["Arin's sword"]), ["Arin"])).toBe(false);
    expect(aboutMember(entry(["Arin"]), [])).toBe(false);
  });

  it("names the drafted member first, the keyword scan second, and nothing otherwise", () => {
    expect(leftToScan(entry(["Mara"]), scan, ["Mara"])).toBe("self");
    expect(leftToScan(entry(["Mara"]), scan, [])).toBe("keyword");
    expect(leftToScan(entry(["dragon"]), scan, ["Mara"])).toBeNull();
    expect(leftToScan(entry(["harbour"]), null, [])).toBeNull();
  });
});
