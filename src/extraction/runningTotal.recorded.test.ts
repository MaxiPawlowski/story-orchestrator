import { StoryEngine, parseStoryV2OrThrow } from "@engine/index";
import { runningTotalRule } from "./contract";
import { sharedReadOverhead } from "./sharedRead";

jest.mock("@services/STAPI", () => ({ getContext: () => ({ chat: [], extensionSettings: {} }) }));

const EVIDENCE_RUBRIC = "How many of these clues to a plot against the Nightriver bloodline has the heir actually found (0 to 3)? The only clues: Javon asked for the second's place rather than being offered it; Leevon's debt to House Valtara; the venom bought near the Academy; Valtara seals on the betrothal papers; the Duchess's night visits. Count one only when the scene puts it in front of the heir as a fact: a document, a witness, a confession, something seen. A character's guess, worry or accusation about a plot is not a clue, and neither is talk of the duel or the seals. Count each clue once.";

const story = parseStoryV2OrThrow({
  format: 2,
  id: "t6-4-whispers",
  title: "Adolion: House Nightriver",
  description: "",
  qualities: [
    { key: "evidence", type: "int", source: "extractor", monotonic: true, rubric: EVIDENCE_RUBRIC },
    { key: "heir_injuries", type: "int", source: "extractor", rubric: "How hurt is the heir right now, as the story has shown it?" },
    { key: "duel_begun", type: "bool", source: "extractor", rubric: "Has the Trial by Combat begun?" },
  ],
  checkpoints: [
    { id: "whispers", name: "Whispers in the Halls", objective: "Find out why the duel was arranged and who benefits from it.", type: "anchor", start: true },
    { id: "the-duel", name: "The Duel", objective: "Survive the Trial.", type: "anchor" },
  ],
  transitions: [
    { from: "whispers", to: "the-duel", priority: 1, gate: { any: [{ q: "evidence", op: ">=", v: 2 }, { q: "duel_begun", op: "==", v: true }] } },
    { from: "whispers", to: "the-duel", priority: 0, gate: { q: "heir_injuries", op: ">=", v: 3 } },
  ],
  roster: [],
});

function promptWith(values: Record<string, number | boolean>) {
  const engine = new StoryEngine();
  engine.loadStory(story);
  const state = engine.serialize();
  const withValues = { ...state, blackboard: { ...state.blackboard, values: { ...state.blackboard.values, ...values } } };
  return sharedReadOverhead({ story, state: withValues, priority: 1, reason: "cue:whispers->the-duel", model: (async () => ({ text: "" })) as never, ask: { role: "read", pass: "read" } } as never);
}

const lineOf = (prompt: string, key: string) => prompt.split("\n").find((line) => line.startsWith(`- ${key}:`)) ?? "";

describe("T6-4: a running count read as a per-window count (journal.jsonl:201-330, evidence = 1 eight times after the second clue)", () => {
  it("the read is told the count it already holds, and to write the story-wide total", () => {
    const line = lineOf(promptWith({ evidence: 1 }), "evidence");
    expect(line).toContain("Current value: 1");
    expect(line).toContain(runningTotalRule(1));
  });

  it("control: a quality that is not a monotonic count gets no running total", () => {
    const prompt = promptWith({ evidence: 1, heir_injuries: 2, duel_begun: false });
    expect(lineOf(prompt, "heir_injuries")).not.toContain("Current value");
    expect(lineOf(prompt, "duel_begun")).not.toContain("Current value");
  });

  it("the prompt changes with the count, so a cached read for an older total is never reused", () => {
    expect(promptWith({ evidence: 1 })).not.toEqual(promptWith({ evidence: 2 }));
  });
});
