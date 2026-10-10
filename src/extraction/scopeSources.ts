import { cardReadKeys } from "@engine/cardFields";
import { activeQuestScopeKeys, moodKey, questScopeKeys, readsByStep, relationshipKey, valueReader, type BlackboardSnapshot, type NormalizedStoryV2 } from "@engine/index";
import { gameLayer } from "@engine/validate/gameLayer";
import { renderQuestion, STEP_READ_HEADER } from "./contract";
import { fitScopeBudget, rotated, scopeSlots, type BudgetTier } from "./scopeBudget";
import { STEP_READ_REMINDER } from "./stepRead";
import type { ScopePull } from "./types";

export const QUEST_SCOPE_CAP = 5;
export const REL_AXES_PER_READ = 12;
export const REL_ROTATION_READS = 4;
export const CARD_MIN_SHARE = 1;

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

export const readScopeSource = (
  source: ScopeSource, story: NormalizedStoryV2, blackboard: BlackboardSnapshot, context: ScopeSourceContext, admits: (key: string) => boolean = () => true,
): ScopeSourceRead => {
  const keys = source.keys(story, blackboard, context).filter(admits);
  return source.cap === null ? { keys, dropped: [] } : { keys: keys.slice(0, source.cap), dropped: keys.slice(source.cap) };
};

export interface ScopeSourceResult extends ScopeSourceRead {
  kind: ScopeSource["kind"];
  cap: number | null;
}

const BUDGETED: ReadonlySet<ScopeSource["kind"]> = new Set(["quest", "relationship"]);

export interface LifeUnit {
  keys: string[];
  phase: number;
}

export const lifeUnits = (story: NormalizedStoryV2): LifeUnit[] => (story.life?.members ?? [])
  .flatMap((member) => [
    ...member.relationships.map((relationship) => relationship.axes.map((axis) => relationshipKey(member.id, relationship.toward, axis))),
    ...(member.mood ? [[moodKey(member.id)]] : []),
  ])
  .map((keys, at) => ({ keys, phase: at % REL_ROTATION_READS }));

export const questionTokens = (text: string): number => (text.match(/[A-Za-z]+|\d|[^\sA-Za-z\d]/g) ?? []).length;

export const questionCost = (story: NormalizedStoryV2) => (key: string): number => {
  const quality = story.qualityByKey[key];
  return quality ? questionTokens(renderQuestion(quality)) : 0;
};

export const STEP_READ_COST = questionTokens(`${STEP_READ_HEADER}\n${STEP_READ_REMINDER}`);

const single = (keys: readonly string[]) => keys.map((key) => [key]);

const chunks = (unit: LifeUnit, size: number): LifeUnit[] =>
  Array.from({ length: Math.ceil(unit.keys.length / size) }, (_, at) => ({ ...unit, keys: unit.keys.slice(at * size, (at + 1) * size) }));

export const relationshipUnits = (story: NormalizedStoryV2, candidates: readonly string[], lead: ReadonlySet<string>, rotation: number, cap: number | null = null) => {
  const offered = new Set(candidates);
  const size = Math.max(1, cap ?? candidates.length);
  const grouped = lifeUnits(story).map((unit) => ({ ...unit, keys: unit.keys.filter((key) => offered.has(key)) })).filter((unit) => unit.keys.length).flatMap((unit) => chunks(unit, size));
  const grouping = new Set(grouped.flatMap((unit) => unit.keys));
  const all = [...grouped, ...candidates.filter((key) => !grouping.has(key)).map((key) => ({ keys: [key], phase: rotation % REL_ROTATION_READS }))];
  const isLead = (unit: LifeUnit) => unit.keys.some((key) => lead.has(key));
  const wait = (unit: LifeUnit) => (unit.phase - (rotation % REL_ROTATION_READS) + REL_ROTATION_READS) % REL_ROTATION_READS;
  const others = all.filter((unit) => !isLead(unit)).sort((left, right) => wait(left) - wait(right));
  return {
    drafted: all.filter(isLead).map((unit) => unit.keys),
    due: others.filter((unit) => wait(unit) === 0).map((unit) => unit.keys),
    rest: others.filter((unit) => wait(unit) !== 0).map((unit) => unit.keys),
  };
};

type Read = ScopeSourceResult & { source: ScopeSource };

export const readScopeSources = (
  sources: readonly ScopeSource[], story: NormalizedStoryV2, blackboard: BlackboardSnapshot, context: ScopeSourceContext, free: ReadonlySet<string> = new Set(),
  admits: (key: string) => boolean = () => true,
): ScopeSourceResult[] => {
  const reads: Read[] = sources.map((source) => ({ source, kind: source.kind, cap: source.cap, ...readScopeSource(source, story, blackboard, context, admits) }));
  if (!reads.some((read) => BUDGETED.has(read.kind) && read.keys.some((key) => !free.has(key)))) return reads.map(({ source: _source, ...read }) => read);
  const rotation = Math.max(0, Math.floor(context.rotation ?? context.cursor ?? 0));
  const ofKind = (kind: ScopeSource["kind"]) => reads.filter((read) => read.kind === kind);
  const leadOf = (read: Read) => new Set(read.source.lead?.(story, blackboard, context) ?? []);
  const caps: Record<string, number> = {};
  const capped = (read: Read, group: string): Pick<BudgetTier, "group"> => {
    if (read.cap === null) return {};
    caps[group] = read.cap;
    return { group };
  };
  const quests = ofKind("quest").map((read, at) => {
    const lead = leadOf(read);
    const all = [...read.keys, ...read.dropped];
    const active = all.filter((key) => lead.has(key));
    const room = read.cap ?? active.length;
    const start = active.length > room && room > 0 ? (rotation * room) % active.length : 0;
    const group = capped(read, `quest:${at}`);
    return { active: { read, tier: { units: single(rotated(active, start)), ...group } }, rest: { read, tier: { units: single(all.filter((key) => !lead.has(key))), ...group } } };
  });
  const cardShare = ofKind("card").map((read, at) => {
    caps[`card-share:${at}`] = CARD_MIN_SHARE;
    return { read, tier: { units: single(rotated(read.keys, rotation)), group: `card-share:${at}` } };
  });
  const relationships = ofKind("relationship").map((read, at) => {
    const split = relationshipUnits(story, [...read.keys, ...read.dropped], leadOf(read), rotation, read.cap);
    const group = capped(read, `relationship:${at}`);
    return { drafted: { read, tier: { units: split.drafted, ...group } }, due: { read, tier: { units: split.due, ...group } }, rest: { read, tier: { units: split.rest, ...group } } };
  });
  const ordered: Array<{ read: Read; tier: BudgetTier }> = [
    ...quests.map((quest) => quest.active),
    ...relationships.map((relationship) => relationship.drafted),
    ...relationships.map((relationship) => relationship.due),
    ...cardShare,
    ...quests.map((quest) => quest.rest),
    ...ofKind("card").map((read) => ({ read, tier: { units: single(rotated(read.keys, rotation)) } })),
    ...relationships.map((relationship) => relationship.rest),
  ];
  const cost = questionCost(story);
  const stepped = (key: string) => {
    const quality = story.qualityByKey[key];
    return quality ? readsByStep(quality) : false;
  };
  const fit = fitScopeBudget({
    free,
    tiers: ordered.map(({ tier }) => tier),
    slots: scopeSlots(free, ofKind("card").flatMap((read) => read.keys), cost),
    cost,
    caps,
    shared: [{ keys: new Set([...free, ...reads.flatMap((read) => [...read.keys, ...read.dropped])].filter(stepped)), cost: STEP_READ_COST }],
  });
  const kept = new Map<Read, Set<string>>();
  ordered.forEach(({ read }, at) => kept.set(read, new Set([...(kept.get(read) ?? []), ...fit.kept[at]])));
  return reads.map((read) => {
    const { source: _source, ...rest } = read;
    const keep = kept.get(read);
    if (!keep) return rest;
    const all = [...read.keys, ...read.dropped];
    return { ...rest, keys: all.filter((key) => keep.has(key)), dropped: all.filter((key) => !keep.has(key)) };
  });
};
