import { newStoryDraft, useDraftStore, type StoryDraft } from "../draft";

export const sampleStory = (): StoryDraft => ({
  format: 2,
  title: "The Ruins Heist",
  description: "A two-beat infiltration of the sun ruins.",
  qualities: [
    { key: "trust", type: "int", source: "extractor", rubric: "How much the guide trusts the party, 0-5." },
    { key: "route", type: "enum", values: ["stealth", "force"], source: "extractor", rubric: "The approach the party takes into the ruins." },
    { key: "alarm", type: "bool", source: "extractor", rubric: "Whether the ruins alarm has been raised." },
  ],
  checkpoints: [
    { id: "start", name: "Approach", objective: "Reach the ruins gate.", type: "intermediate", start: true },
    { id: "infiltrate", name: "Infiltrate", objective: "Get inside unseen.", type: "intermediate", state_snapshot: { route: "stealth" }, tension_target: "tense" },
    { id: "cache", name: "The Cache", objective: "Secure the relic.", type: "anchor" },
  ],
  transitions: [
    { from: "start", to: "infiltrate", priority: 0, gate: { all: [{ q: "route", op: "in", v: ["stealth", "force"] }] }, extraction_hint: "watch how they choose to enter" },
    { from: "infiltrate", to: "cache", priority: 0, gate: { all: [{ q: "trust", op: ">=", v: 2 }, { not: { q: "alarm", op: "==", v: true } }] } },
  ],
  roster: [{ id: "guide", name: "The Guide" }],
});

// Fixture: nothing here is special except the length. A key that is a sentence, a rubric
// that is a paragraph, and twelve options — the shapes a real author produces and a fixed-width row
// does not survive.
export const longNameStory = (): StoryDraft => ({
  format: 2,
  title: "The Long Named Story",
  description: "A story whose names are the whole sentence.",
  qualities: [
    {
      key: "how_completely_the_party_has_earned_the_trust_of_the_ferryman_who_owns_the_only_boat",
      type: "int",
      source: "extractor",
      rubric: "How completely the party has earned the ferryman's trust, read from what they have done in front of him rather than from what they have said about themselves, " +
        "from 0 (he will not look at them) to 5 (he would hand over the tiller).",
    },
    {
      key: "the_road_the_party_took_through_the_flooded_quarter",
      type: "enum",
      values: [
        "the toll road",
        "the flooded underpass",
        "the roof line",
        "the barge",
        "the stairs by the mill",
        "the tunnel under the wall",
        "the old aqueduct",
        "the rope bridge",
        "the long way round",
        "the smuggler's cut",
        "the temple steps",
        "the ferry",
      ],
      source: "extractor",
      rubric: "Which of the twelve ways through the flooded quarter the party actually used.",
    },
  ],
  checkpoints: [
    { id: "start", name: "The Tall Docks at the End of the Flooded Quarter", objective: "Find the ferryman before the water rises.", type: "intermediate", start: true },
    { id: "crossing", name: "The Crossing Nobody Admits They Took", objective: "Get the party across without being named.", type: "anchor" },
  ],
  transitions: [
    { from: "start", to: "crossing", priority: 0, gate: { all: [{ q: "how_completely_the_party_has_earned_the_trust_of_the_ferryman_who_owns_the_only_boat", op: ">=", v: 2 }] } },
  ],
  roster: [{ id: "ferryman", name: "The Ferryman of the Flooded Quarter" }],
});

export const problemStory = (): StoryDraft => ({
  format: 2,
  title: "Problem Story",
  description: "A story with warnings for the diagnostics panel.",
  qualities: [{ key: "trust", type: "int", source: "extractor", rubric: "How much the guide trusts the party." }],
  checkpoints: [
    { id: "start", name: "Start", objective: "Begin.", type: "intermediate", start: true },
    { id: "cache", name: "Cache", objective: "Secure the relic.", type: "anchor", convergence_threshold: 5 },
    { id: "lost", name: "Lost Ending", objective: "An unreachable anchor.", type: "anchor" },
  ],
  transitions: [{ from: "start", to: "cache", priority: 0, gate: { all: [{ q: "trust", op: ">=", v: 2 }] } }],
  roster: [],
});

export const seedDraft = (fixture: StoryDraft = sampleStory()): void => {
  useDraftStore.getState().loadDraft(JSON.parse(JSON.stringify(fixture)) as StoryDraft);
};

export const seedEmptyDraft = (): void => {
  useDraftStore.getState().loadDraft(newStoryDraft());
};
