import type { StoryFeatureId } from "@engine/featurePolicy";

export type FeatureStateRow =
  | { kind: "master"; feature: StoryFeatureId }
  | { kind: "control"; feature: StoryFeatureId; control: string }
  | { kind: "mode"; feature: StoryFeatureId; control: string }
  | { kind: "parts"; parts: ReadonlyArray<{ feature: StoryFeatureId; label: string }> }
  | { kind: "authored"; declares: "commitments" };

const master = (feature: StoryFeatureId): FeatureStateRow => ({ kind: "master", feature });
const control = (feature: StoryFeatureId, field: string): FeatureStateRow => ({ kind: "control", feature, control: field });
const mode = (feature: StoryFeatureId): FeatureStateRow => ({ kind: "mode", feature, control: "acceptMode" });

export const FEATURE_STATE: Readonly<Record<string, FeatureStateRow>> = {
  pacing: master("pacing"),
  memory: { kind: "parts", parts: [{ feature: "reading", label: "Story reading" }, { feature: "memory", label: "Prompt memory" }] },
  chapters: control("chapters", "recap"),
  "continuity-warden": mode("continuity"),
  "speaker-direction": master("speakers"),
  "talk-chain": master("voices"),
  "inner-voice": master("inner"),
  "reply-thinking": master("thinking"),
  "promises-remembered": master("promises"),
  "npc-commitments": { kind: "authored", declares: "commitments" },
  "witness-record": master("witness"),
  rumors: master("rumors"),
  "meanwhile-proposals": mode("meanwhile"),
  "living-story": master("living"),
  "story-branching": master("branching"),
  "memory-lore": master("memoryLore"),
  "late-lore": master("lateLore"),
  curator: master("curator"),
  "curator-create": control("curator", "create"),
  "curator-markers": mode("curator"),
  images: master("illustrations"),
  sprites: master("sprites"),
  "pose-library": master("poses"),
  "character-delivery": master("delivery"),
  "story-patterns": master("patterns"),
};

export const UNMAPPED_STORY_FEATURES: Readonly<Partial<Record<StoryFeatureId, string>>> = {
  agency: "No Help row of its own: the reply checks it runs are described under the continuity warden; its switch is on Story → Features.",
  prefetch: "Part of Branches that follow you, which owns stagecraft.prefetchEnabled; Story → Features shows it under Adaptive branches.",
  cardState: "No Help row: a presentation detail of the character stage, shown on Story → Features only.",
};

export const UNMAPPED_CONTROLS: Readonly<Record<string, string>> = {
  "reading.cadence": "Tuning number, not on or off.",
  "reading.stabilityLag": "Tuning number, not on or off.",
  "chapters.storySoFar": "Prompt-shape detail of chapters; Story → Features.",
  "chapters.fold": "Prompt-shape detail of chapters; Story → Features.",
  "agency.enabled": "See agency in UNMAPPED_STORY_FEATURES.",
  "agency.acceptMode": "See agency in UNMAPPED_STORY_FEATURES.",
  "thinking.effort": "Tuning level, not on or off.",
  "voices.max": "Tuning number, not on or off.",
  "inner.fanOut": "Which speaker it prepares for, not on or off.",
  "inner.harvestReasoning": "A detail of the inner voice; Story → Features.",
  "prefetch.enabled": "See prefetch in UNMAPPED_STORY_FEATURES.",
  "curator.requireMeasured": "Model-route guard of curator creation, not on or off.",
  "lateLore.depth": "Tuning number, not on or off.",
  "illustrations.mode": "When to draw, not on or off.",
  "illustrations.everyN": "Tuning number, not on or off.",
  "sprites.stage": "Display detail of the character stage.",
  "cardState.enabled": "See cardState in UNMAPPED_STORY_FEATURES.",
  "delivery.repetition": "Part of voice and delivery (repeated-phrase notes), not a feature of its own; Story → Features.",
};

export const rowFeatures = (row: FeatureStateRow): Array<{ feature: StoryFeatureId; control: string }> => {
  if (row.kind === "master") return [{ feature: row.feature, control: "enabled" }];
  if (row.kind === "control" || row.kind === "mode") return [{ feature: row.feature, control: "enabled" }, { feature: row.feature, control: row.control }];
  if (row.kind === "parts") return row.parts.map((part) => ({ feature: part.feature, control: "enabled" }));
  return [];
};
