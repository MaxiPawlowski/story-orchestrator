import {
  PREVIOUSLY_BOUNDARIES, factionBand, isHeritageKey, questClosedKey, standingKey,
  type CarryMapEntry, type CarryOutcomeLine, type CarryProjection, type CarryState, type CarryValue, type NormalizedStoryV2, type OutcomeKey, type PrimitiveValue,
} from "./schema";
import { qualityAccepts } from "./blackboard";
import { evaluateGate } from "./gates";
import { valueReader } from "./quests";
import { outcomeKind, progressKeys } from "./validate/carry";

type Values = Readonly<Record<string, unknown>>;
type OutcomeStory = Pick<NormalizedStoryV2, "qualityByKey" | "quests" | "factions" | "outcome">;
type TargetStory = Pick<NormalizedStoryV2, "qualityByKey" | "carry_from" | "roster" | "transitions" | "quests" | "milestones">;

const isPrimitive = (value: unknown): value is PrimitiveValue => typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));

const visible = (gate: Parameters<typeof evaluateGate>[0] | undefined, values: Values): boolean => !gate || evaluateGate(gate, valueReader({ ...values }));

const qualityLabel = (story: OutcomeStory, key: string, value: PrimitiveValue): string | null => {
  const quality = story.qualityByKey[key];
  const named = quality?.player_labels?.[String(value)];
  if (named) return named;
  return quality?.display ? `${quality.display.label}: ${String(value)}` : null;
};

export const outcomeLine = (story: OutcomeStory, entry: OutcomeKey, values: Values): CarryOutcomeLine | null => {
  const value = values[entry.key];
  if (!isPrimitive(value)) return null;
  const authored = entry.heritage_text?.[String(value)];
  const kind = outcomeKind(story, entry.key);
  if (kind === "quest") {
    const quest = (story.quests ?? []).find((candidate) => questClosedKey(candidate.id) === entry.key);
    if (!quest || !visible(quest.visible_when, values)) return null;
    const word = value === "done" ? quest.labels?.done ?? "done" : value === "failed" ? quest.labels?.failed ?? "failed" : null;
    const label = authored ?? (word ? `${quest.title}: ${word}` : null);
    return label ? { key: entry.key, value, label } : null;
  }
  if (kind === "standing") {
    const faction = (story.factions ?? []).find((candidate) => standingKey(candidate.id) === entry.key);
    if (!faction || typeof value !== "number" || !visible(faction.visible_when, values)) return null;
    return { key: entry.key, value, label: authored ?? `${faction.name}: ${factionBand(faction, value)}` };
  }
  if (kind !== "quality") return null;
  const label = authored ?? qualityLabel(story, entry.key, value);
  return label ? { key: entry.key, value, label } : null;
};

export const publicOutcome = (story: OutcomeStory, values: Values, keys?: ReadonlySet<string>): CarryOutcomeLine[] =>
  (story.outcome ?? []).filter((entry) => !keys || keys.has(entry.key)).flatMap((entry) => outcomeLine(story, entry, values) ?? []);

export const sagaOutcomeLines = (story: OutcomeStory, values: Values): string[] => publicOutcome(story, values).map((line) => line.label);

const knownBy = (story: TargetStory, entry: CarryMapEntry): string[] => {
  const roster = story.roster.map((member) => member.id);
  if (entry.known_by === "all") return roster;
  return Array.isArray(entry.known_by) ? entry.known_by.filter((id) => roster.includes(id)) : [];
};

const entryProblem = (story: TargetStory, entry: CarryMapEntry, value: PrimitiveValue): string | null => {
  const carry = story.carry_from;
  const quality = story.qualityByKey[entry.to];
  if (!carry || !quality) return `'${entry.to}' is no longer a quality of this story`;
  if (!qualityAccepts(quality, value)) return `'${entry.to}' no longer accepts the carried value`;
  const fits = entry.as === "heritage" ? isHeritageKey(entry.to) && quality.source === "code" : quality.source !== "code" && !isHeritageKey(entry.to);
  if (!fits) return `'${entry.to}' can no longer take a ${entry.as} value`;
  if (entry.as === "state" && carry.mode === "replay" && (!carry.replay_map?.includes(entry.to) || progressKeys(story).has(entry.to))) return `a replay cannot carry into '${entry.to}'`;
  return null;
};

export interface CarrySkip {
  key: string;
  reason: string;
}

export const carryValues = (story: TargetStory, projection: CarryProjection): { values: CarryValue[]; skipped: CarrySkip[] } => {
  const skipped: CarrySkip[] = [];
  const values = (story.carry_from?.map ?? []).flatMap((entry): CarryValue[] => {
    const line = projection.outcome.find((candidate) => candidate.key === entry.from);
    if (!line) {
      skipped.push({ key: entry.to, reason: `'${entry.from}' was not shown to the player at the end, so '${entry.to}' starts as the story wrote it` });
      return [];
    }
    const problem = entryProblem(story, entry, line.value);
    if (problem) {
      skipped.push({ key: entry.to, reason: problem });
      return [];
    }
    return [{ from: entry.from, key: entry.to, as: entry.as, value: line.value, label: line.label, knownBy: knownBy(story, entry) }];
  });
  return { values, skipped };
};

export const carrySeed = (story: TargetStory, carry: CarryState): { seed: Record<string, PrimitiveValue>; kept: CarryValue[]; dropped: CarrySkip[] } => {
  const dropped: CarrySkip[] = [];
  const kept = carry.values.flatMap((value): CarryValue[] => {
    const entry = story.carry_from?.map.find((candidate) => candidate.to === value.key && candidate.from === value.from && candidate.as === value.as);
    const problem = entry ? entryProblem(story, entry, value.value) : `'${value.key}' is no longer carried by this story`;
    if (problem || !entry) {
      dropped.push({ key: value.key, reason: problem ?? "" });
      return [];
    }
    return [{ ...value, knownBy: knownBy(story, entry) }];
  });
  return { seed: Object.fromEntries(kept.map((value) => [value.key, value.value])), kept, dropped };
};

export const carryKnownLines = (carry: CarryState | null | undefined, rosterId: string): string[] =>
  (carry?.values ?? []).filter((value) => value.knownBy.includes(rosterId)).map((value) => `- From an earlier story, you know: ${value.label}`);

export const previouslyActive = (carry: CarryState | null | undefined, boundary: number, sealedChapters: number): boolean =>
  Boolean(carry?.previously && !carry.dismissed && boundary < PREVIOUSLY_BOUNDARIES && sealedChapters === 0);
