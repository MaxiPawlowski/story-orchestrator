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
