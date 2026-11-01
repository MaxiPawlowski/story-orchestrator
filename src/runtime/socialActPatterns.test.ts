import { StoryEngine, parseStory, parseStoryOrThrow } from "@engine/index";
import { deriveRefs, neutralText } from "./consequences";
import { toMatchRefs } from "./patterns";

const story = (patterns: unknown) => ({
  id: "acts-pattern", title: "Acts pattern", description: "v3.0 43 M4 sifting kind",
  roster: [{ id: "mira", name: "Mira", relationships: [{ toward: "player", axes: ["trust"] }] }],
  qualities: [{ key: "crossed", type: "bool", source: "extractor", rubric: "Crossed?" }],
  checkpoints: [{ id: "bank", name: "Bank", objective: "Cross", type: "anchor", start: true }, { id: "island", name: "Island", objective: "Rest", type: "anchor" }],
  transitions: [{ id: "cross", from: "bank", to: "island", priority: 0, gate: { q: "crossed", op: "==", v: true } }],
  patterns,
});

describe("v3.0 43 M4: the act kind in story patterns", () => {
  test("a pattern step names an act by id with by/to attributes; an unknown attribute is refused", () => {
    expect(Array.isArray(parseStory(story([{ id: "two-lies", steps: [{ kind: "act", id: "lied", where: { by: "player" } }, { kind: "act", id: "lied", to: "mira" }], hint: "Twice now." }])))).toBe(false);
    const errors = parseStory(story([{ id: "bad", steps: [{ kind: "act", id: "lied", where: { giver: "x" } }], hint: "Bad." }]));
    expect(Array.isArray(errors)).toBe(true);
  });

  test("a logged act becomes a match ref with id/by/to and no recap line", () => {
    const loaded = parseStoryOrThrow(story([{ id: "two-lies", steps: [{ kind: "act", id: "lied" }, { kind: "act", id: "lied" }], hint: "Twice now." }]));
    const engine = new StoryEngine({ now: () => 0 });
    engine.loadStory(loaded);
    engine.enqueue({ source: "extractor", blackboardVersionSum: 0, turnRange: { from: 1, to: 2 }, deltas: [{ q: "rel_mira_player_trust", v: -1, source: "extractor", act: "lied" }] });
    engine.commitBoundary({ lastMessageId: 2, chatLength: 3 });
    const refs = engine.stateLog.flatMap((entry) => deriveRefs(loaded, entry));
    expect(refs.map((ref) => [ref.kind, ref.id, ref.from, ref.to])).toEqual([["act", "lied", "player", "mira"]]);
    expect(neutralText(loaded, refs[0])).toBeNull();
    expect(toMatchRefs(loaded, refs).map((ref) => ref.attrs)).toEqual([{ id: "lied", by: "player", to: "mira" }]);
  });
});
