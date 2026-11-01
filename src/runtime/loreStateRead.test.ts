import { parseStoryOrThrow } from "@engine/index";
import { readLoreState } from "./loreStateRead";

const story = parseStoryOrThrow({
  id: "state", title: "State", description: "",
  qualities: [{ key: "trust", type: "int", source: "extractor", rubric: "r" }, { key: "location", type: "enum", values: ["harbour", "market"], source: "extractor", rubric: "Where?" }],
  checkpoints: [{ id: "a", name: "A", objective: "", type: "anchor", start: true }], transitions: [],
  roster: [{ id: "mara", name: "Mara Venn", aliases: ["Cap"] }, { id: "odo", name: "Odo" }],
  quests: [
    { id: "pilot", title: "Find the pilot", kind: "side", done_when: { q: "trust", op: ">=", v: 5 }, steps: [] },
    { id: "rope", title: "Buy rope", kind: "side", done_when: { q: "trust", op: ">=", v: 1 }, steps: [] },
  ],
  codex: { places: [
    { id: "dock", name: "Greywater", known_when: { q: "trust", op: ">=", v: 1 }, facts: [] },
    { id: "vault", name: "The Vault", known_when: { q: "trust", op: ">=", v: 9 }, facts: [] },
  ] },
});

describe("lore scene state from the story (v3.0 43 L2)", () => {
  it("reads the place, the cast switched on, active quests and only the codex entries the player has met", () => {
    expect(readLoreState(story, { location: "harbour", trust: 2, codex_l_dock: 1 }, ["mara"])).toEqual({
      place: "harbour", cast: [{ name: "Mara Venn", aliases: ["Cap"] }], quests: ["Find the pilot"], known: ["Greywater"],
    });
  });

  it("leaves out an unset place and anything not yet met", () => {
    expect(readLoreState(story, { trust: 0 }, [])).toEqual({ cast: [], quests: ["Find the pilot", "Buy rope"], known: [] });
  });
});
