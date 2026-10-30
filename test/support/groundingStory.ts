import { parseStoryOrThrow } from "@engine/validate";
import { StoryEngine, type NormalizedStory } from "@engine/index";

const is = (key: string) => ({ q: key, op: "==", v: true });

export const groundingRaw = (patch: Record<string, unknown> = {}): Record<string, unknown> => ({
  title: "Grounding lab", description: "Synthetic place and time story.",
  roster: [{ id: "guide", name: "Wren" }, { id: "teller", name: "Teller", role: "narrator", view: "omniscient" }],
  qualities: [
    { key: "location", type: "enum", values: ["harbor", "market", "crypt"], player_labels: { harbor: "the harbor" }, source: "extractor", rubric: "Where the party is." },
    { key: "met_wren", type: "bool", source: "extractor", rubric: "Whether the party met Wren." },
    { key: "found_crypt", type: "bool", source: "extractor", rubric: "Whether the crypt was found." },
  ],
  clock: { times: ["morning", "afternoon", "evening", "night"], start_part: "morning" },
  checkpoints: [
    { id: "start", name: "Start", player_name: "Arrival", type: "intermediate", start: true, objective: "Arrive." },
    { id: "end", name: "End", player_name: "Away", type: "anchor", objective: "Leave." },
  ],
  transitions: [{ from: "start", to: "end", priority: 0, gate: is("found_crypt") }],
  codex: {
    people: [{ id: "wren", member: "guide", known_when: is("met_wren"), facts: [{ id: "trade", text: "Sells maps.", known_when: "start" }] }],
    places: [
      { id: "harbor", name: "The harbor", location: "harbor", facts: [] },
      { id: "crypt", name: "The sealed crypt", location: "crypt", known_when: is("found_crypt"), facts: [] },
    ],
  },
  requirements: {
    lorebooks: ["Lab World"],
    place_lore: { harbor: { book: "Lab World", entry: "Harbor" }, crypt: { book: "Lab World", entry: "Crypt" }, market: { book: "Lab World", entry: "Market" } },
    people_lore: { wren: { book: "Lab World", entry: "Wren" } },
  },
  ...patch,
});

export const groundingStory = (patch: Record<string, unknown> = {}): NormalizedStory => parseStoryOrThrow(groundingRaw(patch));

export interface GroundingStep {
  set?: Record<string, string | number | boolean>;
  messageId: number;
}

export const playGrounding = (story: NormalizedStory, steps: GroundingStep[]): StoryEngine => {
  const engine = new StoryEngine({ now: () => 0 });
  engine.loadStory(story);
  for (const step of steps) {
    const deltas = Object.entries(step.set ?? {}).map(([q, v]) => ({ q, v, source: story.qualityByKey[q]?.source ?? "extractor", writer: "manual" as const }));
    if (deltas.length) engine.enqueue({ source: "mechanical", blackboardVersionSum: 0, deltas });
    engine.commitBoundary({ lastMessageId: step.messageId, chatLength: step.messageId + 1 });
  }
  return engine;
};
