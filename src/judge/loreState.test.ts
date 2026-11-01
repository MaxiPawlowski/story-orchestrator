import { buildLoreRequests } from "./lore";
import { LORE_STATE_CAST, loreStateFields, loreStateTerms } from "./loreState";

describe("lore scene state (v3.0 43 L2)", () => {
  const state = {
    place: "the harbour",
    cast: [{ name: "Mara Venn", aliases: ["Cap", "Mara Venn", "the captain", "Venn", "M"] }, { name: "Odo", aliases: [] }],
    quests: ["Find the pilot", "find the pilot"],
    known: ["Greywater"],
  };

  it("renders short capped fields for the judge, aliases beside each name", () => {
    expect(loreStateFields(state)).toEqual({ place: "the harbour", cast: ["Mara Venn (also Cap, the captain, Venn)", "Odo"], quests: ["Find the pilot"], known: ["Greywater"] });
    const crowd = { cast: Array.from({ length: 12 }, (_, index) => ({ name: `N${index}`, aliases: [] })), quests: [], known: [] };
    expect((loreStateFields(crowd).cast as string[]).length).toBe(LORE_STATE_CAST);
    expect(loreStateFields({ cast: [], quests: [], known: [] })).toEqual({});
  });

  it("gives the word match every name once", () => {
    expect(loreStateTerms(state)).toEqual(["the harbour", "Mara Venn", "Cap", "the captain", "Venn", "M", "Odo", "Find the pilot", "Greywater"]);
  });

  it("joins the judge's scene beside name and goal, and leaves a stateless request byte-identical", () => {
    const entry = { world: "W", uid: 1, comment: "Harbour", content: "Ships." };
    const scene = { checkpointName: "Dock", objective: "Board.", window: [{ speaker: "Max", text: "Hi" }] };
    const plain = buildLoreRequests([entry], scene)[0].request;
    expect(JSON.stringify(plain.state)).toBe(JSON.stringify({ scene: { name: "Dock", goal: "Board." }, transcript: [{ id: "msg_1", speaker: "Max", text: "Hi" }] }));
    const withState = buildLoreRequests([entry], { ...scene, state: loreStateFields(state) })[0].request.state as { scene: Record<string, unknown> };
    expect(withState.scene).toEqual({
      name: "Dock", goal: "Board.", place: "the harbour", cast: ["Mara Venn (also Cap, the captain, Venn)", "Odo"], quests: ["Find the pilot"], known: ["Greywater"],
    });
  });
});
