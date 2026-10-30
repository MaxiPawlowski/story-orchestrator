import { keyLabeler, labelForKey } from "./keyLabel";

const story = {
  roster: [{ id: "arin", name: "Arin Vale" }, { id: "arin_b", name: "Bess" }, { id: "guide" }],
  qualities: [{ key: "trust", display: { label: "Guide's trust" } }, { key: "rel_guide_player_trust" }],
  factions: [{ id: "watch", name: "The Watch" }],
};

describe("labelForKey", () => {
  it("prefers the authored display label", () => {
    expect(labelForKey(story, "trust")).toBe("Guide's trust");
  });

  it("reads compiled relationship keys as a sentence with card names, toward the player as you", () => {
    expect(labelForKey(story, "rel_arin_player_trust")).toBe("Arin Vale's trust toward you");
    expect(labelForKey(story, "rel_arin_b_arin_fear")).toBe("Bess' fear toward Arin Vale");
    expect(labelForKey(story, "rel_guide_player_trust")).toBe("guide's trust toward you");
  });

  it("names moods, agenda steps, faction standing and story time", () => {
    expect(labelForKey(story, "mood_arin")).toBe("Arin Vale's mood");
    expect(labelForKey(story, "agenda_guide_find_map_step")).toBe("guide's find map agenda step");
    expect(labelForKey(story, "rep_watch")).toBe("Standing with The Watch");
    expect(labelForKey(story, "story_day")).toBe("Story day");
  });

  it("falls back to spaced words for anything it cannot resolve", () => {
    expect(labelForKey(story, "rel_nobody_player_trust")).toBe("rel nobody player trust");
    expect(labelForKey(story, "mood_arin_extra")).toBe("mood arin extra");
    expect(labelForKey(null, "x_y")).toBe("x_y");
  });

  it("caches per labeler", () => {
    const label = keyLabeler(story);
    expect(label("mood_arin")).toBe(label("mood_arin"));
  });
});
