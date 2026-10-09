import { cardReadKeys } from "@engine/cardFields";
import { activeQuestScopeKeys, questScopeKeys, valueReader, type BlackboardSnapshot, type NormalizedStoryV2 } from "@engine/index";
import { gameLayer } from "@engine/validate/gameLayer";
import { fitScopeBudget, scopeSlots, type BudgetTier } from "./scopeBudget";
import type { ScopePull } from "./types";

export const QUEST_SCOPE_CAP = 5;
export const REL_AXES_PER_READ = 8;

export interface ScopeSourceContext {
  owners?: string[];
  cursor?: number;
  present?: string[];
  drafted?: string | null;
  rotation?: number;
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
  lead?: (story: NormalizedStoryV2, blackboard: BlackboardSnapshot, context: ScopeSourceContext) => string[];
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
  lead: (story, blackboard) => activeQuestScopeKeys(story.quests, valueReader(blackboard.values)).filter(readable(story, blackboard)),
};

export const RELATIONSHIP_SOURCE: ScopeSource = {
  kind: "relationship",
  detail: "a present character's feelings or mood",
  cap: REL_AXES_PER_READ,
  keys: (story, blackboard, context) => (story.life
    ? gameLayer()?.life.lifeScopeKeys(story, blackboard.values, { present: context.present, drafted: context.drafted }).filter(readable(story, blackboard)) ?? []
    : []),
  lead: (story, blackboard, context) => (story.life
    ? gameLayer()?.life.lifeScopeTiers(story, blackboard.values, { present: context.present, drafted: context.drafted }).drafted ?? []
    : []),
};

export const SCOPE_SOURCES: readonly ScopeSource[] = [CARD_SOURCE, QUEST_SOURCE, RELATIONSHIP_SOURCE];

export const readScopeSource = (source: ScopeSource, story: NormalizedStoryV2, blackboard: BlackboardSnapshot, context: ScopeSourceContext): ScopeSourceRead => {
  const keys = source.keys(story, blackboard, context);
  return source.cap === null ? { keys, dropped: [] } : { keys: keys.slice(0, source.cap), dropped: keys.slice(source.cap) };
};

export interface ScopeSourceResult extends ScopeSourceRead {
  kind: ScopeSource["kind"];
  cap: number | null;
}

const BUDGETED: ReadonlySet<ScopeSource["kind"]> = new Set(["quest", "relationship"]);

export const readScopeSources = (
  sources: readonly ScopeSource[], story: NormalizedStoryV2, blackboard: BlackboardSnapshot, context: ScopeSourceContext, free: ReadonlySet<string> = new Set(),
): ScopeSourceResult[] => {
  const reads = sources.map((source) => ({ source, kind: source.kind, cap: source.cap, ...readScopeSource(source, story, blackboard, context) }));
  if (!reads.some((read) => BUDGETED.has(read.kind) && read.keys.some((key) => !free.has(key)))) return reads.map(({ source: _source, ...read }) => read);
  const ofKind = (kind: ScopeSource["kind"]) => reads.filter((read) => read.kind === kind);
  const capOf = (read: (typeof reads)[number], used: number) => (read.cap === null ? {} : { cap: Math.max(0, read.cap - used) });
  const leadOf = (read: (typeof reads)[number]) => new Set(read.source.lead?.(story, blackboard, context) ?? []);
  const tiers: Array<{ read: (typeof reads)[number]; tier: BudgetTier }> = [
    ...ofKind("quest").flatMap((read) => {
      const lead = leadOf(read);
      const all = [...read.keys, ...read.dropped];
      const active = all.filter((key) => lead.has(key));
      return [
        { read, tier: { keys: active, rotate: true, ...capOf(read, 0) } },
        { read, tier: { keys: all.filter((key) => !lead.has(key)), ...capOf(read, active.length) } },
      ];
    }),
    ...ofKind("relationship").flatMap((read) => {
      const lead = leadOf(read);
      const drafted = read.keys.filter((key) => lead.has(key));
      return [
        { read, tier: { keys: drafted } },
        { read, tier: { keys: [...read.keys, ...read.dropped].filter((key) => !lead.has(key)), rotate: true, ...capOf(read, drafted.length) } },
      ];
    }),
    ...ofKind("card").map((read) => ({ read, tier: { keys: read.keys } })),
  ];
  const fit = fitScopeBudget({
    free,
    tiers: tiers.map(({ tier }) => tier),
    slots: scopeSlots(free, ofKind("card").flatMap((read) => read.keys)),
    rotation: context.rotation ?? context.cursor ?? 0,
  });
  const kept = new Map<(typeof reads)[number], Set<string>>();
  tiers.forEach(({ read }, at) => kept.set(read, new Set([...(kept.get(read) ?? []), ...fit.kept[at]])));
  return reads.map(({ source: _source, ...read }, at) => {
    const keep = kept.get(reads[at]);
    if (!keep) return read;
    const all = [...read.keys, ...read.dropped];
    return { ...read, keys: all.filter((key) => keep.has(key)), dropped: all.filter((key) => !keep.has(key)) };
  });
};

type Overflow = Array<{ kind: ScopeSource["kind"]; dropped: string[] }>;

export const scopeOverflow = (story: NormalizedStoryV2 | null, blackboard: BlackboardSnapshot | null, sources: readonly ScopeSource[] = SCOPE_SOURCES): Overflow =>
  (story && blackboard ? sources.map((source) => ({ kind: source.kind, dropped: readScopeSource(source, story, blackboard, {}).dropped })).filter((row) => row.dropped.length) : []);
