import { buildSettingsIndex, searchSettings } from "./settingsIndex";

const ids = (authorView: boolean) => buildSettingsIndex(authorView).map((entry) => entry.id);

describe("settings search index (v3.0 29 phase 2)", () => {
  it("lists every entry once", () => {
    const all = ids(true);
    expect(all.length).toBe(new Set(all).size);
  });

  it("finds the harvest wave's feature settings on the Features page", () => {
    for (const [query, id] of [["skip ahead", "feature:skip.enabled"], ["put off", "feature:deferrals.enabled"], ["chunks", "feature:chapters.compact"]] as const) {
      const hit = searchSettings(buildSettingsIndex(false), query).find((entry) => entry.id === id);
      expect([query, hit?.intent]).toEqual([query, expect.objectContaining({ context: "orchestrator", page: "features" })]);
    }
  });

  it("keeps the prompt trials and lore pins out of the player's search, and homes them in Author view", () => {
    const author = ["setting:worldInfo.lorePins", "setting:memory.historyNotes", "setting:memory.outwardNarration", "setting:talk.swipeContrast"];
    expect(ids(false).filter((id) => author.includes(id))).toEqual([]);
    const index = buildSettingsIndex(true);
    expect(author.map((id) => index.find((entry) => entry.id === id)?.intent.page)).toEqual(["world", "authoring", "authoring", "authoring"]);
  });
});
