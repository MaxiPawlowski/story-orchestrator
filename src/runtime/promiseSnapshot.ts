import { questStatus, valueReader, type NormalizedStoryV2 } from "@engine/index";
import { playerPromises } from "@memory/promises/state";
import type { PlayerPromise } from "@memory/promises/types";
import { nameForRosterId } from "./roster";
import type { RuntimeExtras } from "./types";

export const promisesSlice = (story: NormalizedStoryV2 | null, extras: Pick<RuntimeExtras, "promises" | "memory">, values: Record<string, unknown>): PlayerPromise[] => {
  if (!story || !extras.promises?.rows.length || extras.memory.settings.promises === false) return [];
  const reader = valueReader(values);
  const quest = (id: string) => story.quests?.find((entry) => entry.id === id);
  return playerPromises(extras.promises, (id) => nameForRosterId(story, id), (id) => {
    const found = quest(id);
    return found ? questStatus(found, reader) : null;
  }, (id) => quest(id)?.title);
};
