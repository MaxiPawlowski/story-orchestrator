import { evaluateGate } from "../gates";
import {
  PARTY_LOCATION_KEY, RELATIONSHIP_TOWARD_PLAYER, moodKey, moodAgeKey, moodSceneKey, relationshipKey,
  type LifeMember, type NormalizedStoryV2, type PrimitiveValue,
} from "../schema";
import { sceneMarker } from "./derive";

type Values = Readonly<Record<string, PrimitiveValue>>;

const reader = (values: Values) => ({ get: (key: string) => values[key] });

export const whereabouts = (member: LifeMember, values: Values): string | null =>
  member.schedule.find((entry) => evaluateGate(entry.when, reader(values)))?.at ?? null;

export const isAway = (member: LifeMember, values: Values): boolean => {
  const at = whereabouts(member, values);
  if (at === null) return false;
  const here = values[PARTY_LOCATION_KEY];
  return typeof here === "string" ? at.trim().toLowerCase() !== here.trim().toLowerCase() : true;
};

export const awayMembers = (story: NormalizedStoryV2 | null, values: Values): string[] =>
  (story?.life?.members ?? []).filter((member) => isAway(member, values)).map((member) => member.id);

export const moodExpired = (member: LifeMember, values: Values): boolean => {
  const mood = member.mood;
  if (!mood || values[moodKey(member.id)] === undefined) return true;
  if ("boundaries" in mood.lasts) return Number(values[moodAgeKey(member.id)] ?? 0) >= mood.lasts.boundaries;
  return values[moodSceneKey(member.id)] !== undefined && values[moodSceneKey(member.id)] !== sceneMarker(values);
};

export const effectiveMood = (member: LifeMember, values: Values): string | null => {
  if (!member.mood) return null;
  const read = values[moodKey(member.id)];
  return moodExpired(member, values) || typeof read !== "string" ? member.mood.baseline : read;
};

const axisKeys = (member: LifeMember, present: ReadonlySet<string>): string[] => member.relationships
  .filter((relationship) => relationship.toward === RELATIONSHIP_TOWARD_PLAYER || present.has(relationship.toward))
  .flatMap((relationship) => relationship.axes.map((axis) => relationshipKey(member.id, relationship.toward, axis)));

const moodKeys = (member: LifeMember, values: Values): string[] => (member.mood && moodExpired(member, values) ? [moodKey(member.id)] : []);

export interface LifeScopeContext {
  present?: string[];
  drafted?: string | null;
}

export interface LifeScopeTiers {
  drafted: string[];
  others: string[];
}

export const lifeScopeTiers = (story: NormalizedStoryV2, values: Values, context: LifeScopeContext): LifeScopeTiers => {
  const members = story.life?.members ?? [];
  if (!members.length) return { drafted: [], others: [] };
  const away = new Set(awayMembers(story, values));
  const present = new Set((context.present ?? members.map((member) => member.id)).filter((id) => !away.has(id)));
  const here = members.filter((member) => present.has(member.id));
  const drafted = [...new Set(here.filter((member) => member.id === context.drafted).flatMap((member) => [...axisKeys(member, present), ...moodKeys(member, values)]))];
  const others = here.filter((member) => member.id !== context.drafted);
  const lead = new Set(drafted);
  return {
    drafted,
    others: [...new Set([...others.flatMap((member) => axisKeys(member, present)), ...others.flatMap((member) => moodKeys(member, values))])].filter((key) => !lead.has(key)),
  };
};

export const lifeScopeKeys = (story: NormalizedStoryV2, values: Values, context: LifeScopeContext): string[] => {
  const tiers = lifeScopeTiers(story, values, context);
  return [...tiers.drafted, ...tiers.others];
};
