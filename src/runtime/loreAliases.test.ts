import { readFileSync } from "fs";
import { join } from "path";
import { parseStoryOrThrow, type NormalizedStory } from "@engine/index";
import type { HostScannableEntry } from "@services/STAPI";
import { aliasEntities, aliasKeys, applyLoreAliases, loreAliasesFor } from "./loreAliases";
import { keywordWillActivate, type ScanBufferView } from "./loreKeyMatch";

type Fixture = { roster: NormalizedStory["roster"]; codex: NormalizedStory["codex"]; rows: Array<{ id: string; text: string; keys: string[]; fires: boolean }> };
const fixture = JSON.parse(readFileSync(join(__dirname, "../../test/fixtures/lore-aliases.json"), "utf8")) as Fixture;

const story = parseStoryOrThrow({
  id: "alias", title: "Alias", description: "", qualities: [],
  checkpoints: [{ id: "a", name: "A", objective: "", type: "anchor", start: true }], transitions: [],
  roster: fixture.roster, codex: fixture.codex, requirements: { lorebooks: ["Lore"] },
});

const buffer = (text: string): ScanBufferView => ({ messages: [text], depth: 4, caseSensitive: false, matchWholeWords: true });
const entry = (uid: number, keys: string[], extra: Partial<HostScannableEntry> = {}): HostScannableEntry => ({ world: "Lore", uid, comment: `E${uid}`, content: "x", key: keys, ...extra });
const owned = (on = true) => loreAliasesFor({ enabled: () => on, story: () => story, chatId: () => "c1", ownedChat: () => "c1" });

describe("alias pass (v3.0 43 L2)", () => {
  it("builds one name set per person or place, and drops a name two of them share", () => {
    const sets = aliasEntities(story);
    expect(sets).toContainEqual(["Mara Venn", "Cap"]);
    expect(sets).toContainEqual(["Greywater Harbour", "the docks", "Greywater"]);
    expect(sets.flat()).not.toContain("the captain");
    expect(sets.some((names) => names.includes("Tull"))).toBe(false);
  });

  it("adds a set's other names to an entry keyed on one of them, never to regex keys", () => {
    const sets = aliasEntities(story);
    expect(aliasKeys(["Odo"], sets)).toEqual(["the ropeseller"]);
    expect(aliasKeys(["/odo/i"], sets)).toEqual([]);
    expect(aliasKeys(["harbour"], sets)).toEqual([]);
  });

  it("nickname fixture: before, no nickname row fires; after, every row matches its label", () => {
    const plan = owned();
    const before = fixture.rows.map((row) => keywordWillActivate(entry(1, row.keys), buffer(row.text)));
    const after = fixture.rows.map((row) => {
      const copy = entry(1, row.keys);
      applyLoreAliases([[copy]], plan);
      return keywordWillActivate(copy, buffer(row.text));
    });
    const nickname = (row: Fixture["rows"][number]) => row.fires && !row.text.includes(row.keys[0]);
    expect(fixture.rows.filter(nickname).length).toBe(5);
    expect(fixture.rows.filter((row, index) => nickname(row) && before[index])).toEqual([]);
    expect(fixture.rows.filter((row, index) => after[index] !== row.fires).map((row) => row.id)).toEqual([]);
  });

  it("touches only the story's books, enabled keyed entries, and a fresh key array (the cached file stays as it was)", () => {
    const keys = ["Odo"];
    const own = entry(1, keys);
    const foreign: HostScannableEntry = { ...entry(2, ["Odo"]), world: "Other" };
    const constant = entry(3, ["Odo"], { constant: true });
    const off = entry(4, ["Odo"], { disable: true });
    expect(applyLoreAliases([[own, foreign], [constant, off]], owned())).toEqual({ entries: 1, keys: 1 });
    expect(own.key).toEqual(["Odo", "the ropeseller"]);
    expect(keys).toEqual(["Odo"]);
    expect([foreign.key, constant.key, off.key]).toEqual([["Odo"], ["Odo"], ["Odo"]]);
  });

  it("refuses with the switch off or in a chat the story does not own", () => {
    expect(owned(false).refusal).toBe("setting-off");
    expect(loreAliasesFor({ enabled: () => true, story: () => story, chatId: () => "c2", ownedChat: () => "c1" }).refusal).toBe("not-owned");
    const copy = entry(1, ["Odo"]);
    applyLoreAliases([[copy]], owned(false));
    expect(copy.key).toEqual(["Odo"]);
  });
});
