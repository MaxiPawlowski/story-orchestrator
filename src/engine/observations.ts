import { unitDraw } from "./chance";
import { knownWhenHolds, knownWhenKeys, latchedAt, type CodexLatchView } from "./codex";
import { observationKey, observationMissedKey, type NormalizedStory, type Observation, type PrimitiveValue } from "./schema";
import { resolveRoll, type RollResult } from "./storyChecks";

type Values = Readonly<Record<string, unknown>>;

export interface ObservationChanceIds {
  chatId: string;
  storyId: string;
}

export interface ObservationLatchView extends CodexLatchView {
  chance?: ObservationChanceIds;
}

export type ObservationStory = Pick<NormalizedStory, "observations">;

export const noticedAt = (observation: Observation, values: Values): number | null => latchedAt(observationKey(observation.id), values);

export const observationSettled = (observation: Observation, values: Values): boolean =>
  values[observationKey(observation.id)] !== undefined || values[observationMissedKey(observation.id)] !== undefined;

export const observationUnits = (observation: Observation, ids: ObservationChanceIds, boundary: number): number[] =>
  Array.from({ length: observation.passive?.roll.dice ?? 1 }, (_, index) => unitDraw([ids.chatId, ids.storyId, boundary, `observe:${observation.id}:${index}`]));

export const observationRoll = (observation: Observation, ids: ObservationChanceIds, boundary: number, values: Values): RollResult | null =>
  (observation.passive
    ? resolveRoll(observation.passive.roll, observation.passive.modifiers, observationUnits(observation, ids, boundary), values as Readonly<Record<string, PrimitiveValue>>)
    : null);

const latchOne = (observation: Observation, view: ObservationLatchView): Array<{ q: string; v: number }> => {
  if (observationSettled(observation, view.values) || !knownWhenHolds(observation.when, view.values, view)) return [];
  if (!observation.passive) return [{ q: observationKey(observation.id), v: view.boundary }];
  if (!view.chance) return [];
  const roll = observationRoll(observation, view.chance, view.boundary, view.values);
  return [{ q: roll?.success ? observationKey(observation.id) : observationMissedKey(observation.id), v: view.boundary }];
};

export const observationLatches = (story: ObservationStory, view: ObservationLatchView): Array<{ q: string; v: number }> =>
  (story.observations ?? []).flatMap((observation) => latchOne(observation, view));

export const observationScopeUnits = (story: ObservationStory, values: Values): { entries: string[][]; facts: string[][] } => ({
  entries: [],
  facts: (story.observations ?? []).filter((observation) => !observationSettled(observation, values))
    .map((observation) => [...new Set(knownWhenKeys(observation.when))]).filter((keys) => keys.length > 0),
});
