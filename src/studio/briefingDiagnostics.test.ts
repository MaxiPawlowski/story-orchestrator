import type { StoryV2 } from "@engine/index";
import { DIAGNOSTIC_CONSEQUENCES, runDiagnostics } from "./diagnostics";

const story = (briefingText: string, extra: Partial<StoryV2> = {}): StoryV2 => ({
  format: 2, id: "spoil", title: "Spoil", description: "d",
  qualities: [{ key: "fate", type: "enum", source: "extractor", rubric: "Fate?", values: ["undecided", "betrayed", "spared"] }],
  roster: [{ id: "mara", name: "Mara" }, { id: "kael", name: "Kael", aliases: ["the stranger"] }],
  checkpoints: [
    { id: "cp-1", name: "The Gate", objective: "o", type: "anchor", start: true, state_snapshot: { fate: "undecided" }, effects: { cast_changes: { disable: ["kael"] } } },
    { id: "cp-2", name: "Throne Room", objective: "o", type: "anchor" },
  ],
  transitions: [{ from: "cp-1", to: "cp-2", gate: { q: "fate", op: "==", v: "betrayed" }, priority: 0 }],
  briefing: { sections: [{ heading: "The world", text: briefingText }] },
  ...extra,
});

const spoilers = (draft: StoryV2) => runDiagnostics(draft).filter((diagnostic) => diagnostic.code === "briefing-spoiler-risk");

describe("v2.7 05 briefing-spoiler-risk", () => {
  it("names a later checkpoint, its id, a story value and a character muted at the start", () => {
    const found = spoilers(story("You reach the Throne Room (cp-2) betrayed, and Kael waits."));
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ path: "briefing.sections.0.text", severity: "warning", consequence: DIAGNOSTIC_CONSEQUENCES["briefing-spoiler-risk"] });
    expect(found[0].message).toContain("'Throne Room'");
    expect(found[0].message).toContain("'cp-2'");
    expect(found[0].message).toContain("'betrayed'");
    expect(found[0].message).toContain("'Kael'");
    expect(spoilers(story("Beware the stranger."))[0]?.message).toContain("'the stranger'");
  });

  it("controls: the start checkpoint, its starting value, a present character and word parts never count", () => {
    expect(spoilers(story("At The Gate you are undecided. Mara travels with you. Betrayal is a word; throne rooms are plural."))).toEqual([]);
    expect(spoilers(story("Plain.", { briefing: undefined }))).toEqual([]);
  });

  it("checks a chapter briefing against what is still ahead of that chapter", () => {
    const chaptered = story("Plain.", {
      chapters: [{ id: "one", title: "One" }, { id: "two", title: "Two", briefing: { sections: [{ heading: "Now", text: "You stand in the Throne Room. The Gate is behind you." }] } }],
      checkpoints: [
        { id: "cp-1", name: "The Gate", objective: "o", type: "anchor", start: true, chapter: "one" },
        { id: "cp-2", name: "Throne Room", objective: "o", type: "anchor", chapter: "two" },
        { id: "cp-3", name: "The Pyre", objective: "o", type: "anchor", chapter: "two" },
      ],
      transitions: [{ from: "cp-1", to: "cp-2", gate: { q: "fate", op: "==", v: "spared" }, priority: 0 }, { from: "cp-2", to: "cp-3", gate: { q: "fate", op: "==", v: "spared" }, priority: 0 }],
    });
    expect(spoilers(chaptered)).toEqual([]);
    const ahead = { ...chaptered, chapters: chaptered.chapters?.map((chapter) => (chapter.briefing ? { ...chapter, briefing: { sections: [{ heading: "Now", text: "The Pyre awaits." }] } } : chapter)) };
    expect(spoilers(ahead).map((diagnostic) => diagnostic.path)).toEqual(["chapters.1.briefing.sections.0.text"]);
  });

  it("checks the briefing picture against the install's backgrounds", () => {
    const pictured = story("Plain.", { briefing: { image: "road.jpg", sections: [{ heading: "H", text: "Plain." }] } });
    expect(runDiagnostics(pictured, { backgroundNames: () => ["road.png"] }).filter((diagnostic) => diagnostic.code === "background-missing")).toEqual([]);
    expect(runDiagnostics(pictured, { backgroundNames: () => ["town.png"] }).filter((diagnostic) => diagnostic.code === "background-missing").map((diagnostic) => diagnostic.path)).toEqual(["briefing.image"]);
  });
});
