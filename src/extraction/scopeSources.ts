import { cardReadKeys } from "@engine/cardFields";
import { questScopeKeys, valueReader, type BlackboardSnapshot, type NormalizedStoryV2 } from "@engine/index";
import type { ScopePull } from "./types";

export const QUEST_SCOPE_CAP = 5;

export interface ScopeSourceContext {
  owners?: string[];
  cursor?: number;
}

export interface ScopeSourceRead {
  keys: string[];
  dropped: string[];
}

export interface ScopeSource {
  kind: Extract<ScopePull["kind"], "card" | "quest" | "relationship">;
  detail: string;
  cap: number | null;
  keys: (story: NormalizedStoryV2, blackboard: BlackboardSnapshot, context: ScopeSourceContext) => string[];
}

const readable = (story: NormalizedStoryV2, blackboard: BlackboardSnapshot) => (key: string) =>
  story.qualityByKey[key]?.source === "extractor" && !blackboard.latched[key];

export const CARD_SOURCE: ScopeSource = {
  kind: "card",
  detail: "current public character field",
  cap: null,
  keys: (story, _blackboard, context) => cardReadKeys(story, context.owners ?? story.roster.map((member) => member.id), context.cursor ?? 0),
};

export const QUEST_SOURCE: ScopeSource = {
  kind: "quest",
  detail: "a quest's next step",
  cap: QUEST_SCOPE_CAP,
  keys: (story, blackboard) => questScopeKeys(story.quests, valueReader(blackboard.values)).filter(readable(story, blackboard)),
};

export const SCOPE_SOURCES: readonly ScopeSource[] = [CARD_SOURCE, QUEST_SOURCE];

export const readScopeSource = (source: ScopeSource, story: NormalizedStoryV2, blackboard: BlackboardSnapshot, context: ScopeSourceContext): ScopeSourceRead => {
  const keys = source.keys(story, blackboard, context);
  return source.cap === null ? { keys, dropped: [] } : { keys: keys.slice(0, source.cap), dropped: keys.slice(source.cap) };
};

type Overflow = Array<{ kind: ScopeSource["kind"]; dropped: string[] }>;

export const scopeOverflow = (story: NormalizedStoryV2 | null, blackboard: BlackboardSnapshot | null, sources: readonly ScopeSource[] = SCOPE_SOURCES): Overflow =>
  (story && blackboard ? sources.map((source) => ({ kind: source.kind, dropped: readScopeSource(source, story, blackboard, {}).dropped })).filter((row) => row.dropped.length) : []);
