import type { CodexReached } from "./codexSchema";
import type { CheckModifier, CheckRoll } from "./gameSchema";
import type { GateNode } from "./schema";

export const OBSERVATIONS_MAX = 60;
export const OBSERVATION_TEXT_MAX = 200;
export const OBSERVATION_KEY_PREFIX = "obs_";
export const OBSERVATION_MISSED_SUFFIX = "_missed";

export type ObservationWhen = GateNode | CodexReached;

export interface ObservationPassive {
  roll: CheckRoll;
  modifiers?: CheckModifier[];
}

export interface Observation {
  id: string;
  text: string;
  when: ObservationWhen;
  source?: string;
  rev?: number;
  passive?: ObservationPassive;
}

export const observationKey = (id: string): string => `${OBSERVATION_KEY_PREFIX}${id}`;

export const observationMissedKey = (id: string): string => `${OBSERVATION_KEY_PREFIX}${id}${OBSERVATION_MISSED_SUFFIX}`;

export const isObservationKey = (key: string): boolean => key.startsWith(OBSERVATION_KEY_PREFIX);

export const observationIdentity = (observation: Pick<Observation, "id" | "rev" | "when" | "passive">): string =>
  `${observation.id}@${observation.rev ?? 1}:${JSON.stringify([observation.when, observation.passive ?? null])}`;
