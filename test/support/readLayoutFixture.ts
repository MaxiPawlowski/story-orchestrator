import { StoryEngine, parseStoryOrThrow, type NormalizedStory } from "@engine/index";
import { runSharedRead, type RunSharedReadOptions } from "../../src/extraction/sharedRead";
import type { OpenPromiseRef } from "../../src/memory/promises/types";
import type { ParsedFact, SharedReadWindow } from "../../src/extraction/types";
import { readWith } from "./modelCall";

export const READ_LAYOUT_STORY = (): NormalizedStory => parseStoryOrThrow({
  id: "read-layout", title: "Read layout", description: "v3.0 A1 read line order fixture",
  qualities: [
    { key: "gate_open", type: "bool", source: "extractor", rubric: "Is the north gate open?" },
    { key: "coins_paid", type: "int", source: "extractor", monotonic: true, rubric: "How many coins has the party paid the ferryman in total?" },
    { key: "mood", type: "enum", source: "extractor", values: ["calm", "wary", "angry"], rubric: "How does the ferryman feel about the party?" },
  ],
  checkpoints: [
    { id: "dock", name: "The Dock", objective: "Hire the ferry", type: "anchor", start: true },
    { id: "river", name: "The River", objective: "Cross before dark", type: "anchor" },
  ],
  transitions: [{ from: "dock", to: "river", priority: 0, gate: { q: "gate_open", op: "==", v: true } }],
  roster: [{ id: "mara", name: "Mara", role: "the ferryman's daughter" }, { id: "oren", name: "Oren", role: "the ferryman" }],
});

export interface ReadLayoutTurn {
  checkpoint: "dock" | "river";
  coins: number;
  arcs: string[];
  entities: string[];
  facts: ParsedFact[];
  promises: OpenPromiseRef[];
  window: SharedReadWindow;
}

const message = (index: number, speaker: string, text: string, isUser = false) => ({ index, messageId: index, speaker, text, isUser });

export const READ_LAYOUT_TURNS: readonly ReadLayoutTurn[] = [
  {
    checkpoint: "dock", coins: 2, arcs: ["Oren wants the toll before dusk"], entities: ["Mara", "Oren", "North gate"],
    facts: [{ importance: 3, text: "The ferry only runs while the north gate is open.", evidence: "only runs while the gate is open" }],
    promises: [{ id: "p1a2b3c4", promisee: "Mara", quote: "I'll bring your letter back" }],
    window: { from: 3, to: 5, messages: [
      message(3, "Oren", "Two more coins, or you swim."),
      message(4, "Rin", "Fine. I hand him two coins. \"I promise you I'll pay the rest at the far bank.\"", true),
      message(5, "Mara", "Father, the gate is still open, they can cross."),
    ] },
  },
  {
    checkpoint: "river", coins: 4, arcs: ["Oren wants the toll before dusk", "Someone follows the ferry"], entities: ["Mara", "Oren", "North gate", "Far bank"],
    facts: [
      { importance: 3, text: "The ferry only runs while the north gate is open.", evidence: "only runs while the gate is open" },
      { importance: 2, text: "Rin paid four coins in total.", evidence: "four coins" },
    ],
    promises: [{ id: "p1a2b3c4", promisee: "Mara", quote: "I'll bring your letter back" }, { id: "p9f8e7d6", promisee: "Oren", quote: "I'll pay the rest at the far bank" }],
    window: { from: 6, to: 8, messages: [
      message(6, "Oren", "Hold on to the rail, the current is strong here."),
      message(7, "Rin", "I look back at the dock.", true),
      message(8, "Mara", "A boat is following us."),
    ] },
  },
];

export const readLayoutRead = async (turn: ReadLayoutTurn, extra: Partial<RunSharedReadOptions> = {}) => {
  const story = READ_LAYOUT_STORY();
  const engine = new StoryEngine();
  engine.loadStory(story);
  const state = engine.serialize();
  const visitedAnchors = turn.checkpoint === "river" ? ["dock", "river"] : ["dock"];
  const blackboard = { ...state.blackboard, values: { ...state.blackboard.values, coins_paid: turn.coins } };
  return runSharedRead({
    story, state: { ...state, activeCheckpointId: turn.checkpoint, visitedAnchors, blackboard }, priority: 0, reason: "read-layout", window: turn.window,
    facts: turn.facts, openArcs: turn.arcs, openPromises: turn.promises, epistemicLedgerCapable: true, entities: turn.entities,
    firedTransitions: turn.checkpoint === "river" ? story.outgoingByCheckpoint.dock ?? [] : [],
    ...readWith("p1", { debugResponse: "NO_DELTA" }), ...extra,
  });
};
