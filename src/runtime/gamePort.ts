import { questRewardKey, type BoundaryLogEntry, type BoundaryResult, type NormalizedStoryV2, type Quest, type StoryEngine } from "@engine/index";
import type { EffectsApplier } from "./effectsApplier";
import { beginRun, type RunOwnership } from "./runToken";
import { checkOutcomeBlock, checkRecordsAt, createChecks, recordChecks } from "./storyCheckDraws";
import { stagedPath } from "./worldInfoGates";
import type { LoadedStory, RuntimeExtras } from "./types";

export interface GamePortDeps {
  engine: StoryEngine;
  loaded: () => LoadedStory | null;
  extras: () => RuntimeExtras;
  effects: () => EffectsApplier;
  ownership: RunOwnership;
  persist: () => Promise<void>;
  notify: () => void;
}

const rewardsLanded = (story: NormalizedStoryV2, entry: BoundaryLogEntry): Quest[] => (story.quests ?? []).filter((quest) => {
  const key = questRewardKey(quest.id);
  return quest.reward?.effects && entry.before.blackboard.values[key] !== true && entry.after.blackboard.values[key] === true;
});

export function createGamePort(deps: GamePortDeps) {
  const dispatch = async (story: NormalizedStoryV2, landed: Quest[], entry: BoundaryLogEntry) => {
    const run = beginRun(deps.ownership);
    const path = stagedPath(deps.engine.checkpointPath, deps.engine.serialize().stagedFrom);
    const at = { checkpointId: null, boundary: entry.boundary, messageId: entry.context.lastMessageId };
    await deps.effects().applyQuestRewards(story, landed, deps.extras(), entry.after.blackboard.values, path, at, run);
    if (!run.stillOwns()) return;
    await deps.persist();
    if (run.stillOwns()) deps.notify();
  };
  return {
    onBoundary(result: BoundaryResult, chatId: string | null) {
      const loaded = deps.loaded();
      const entry = deps.engine.stateLog.at(-1);
      if (!loaded || !entry || entry.boundary !== result.boundary) return;
      const storyId = loaded.story.id ?? loaded.record.id;
      const records = checkRecordsAt(loaded.story, chatId && storyId ? { chatId, storyId } : null, entry);
      const extras = deps.extras();
      if (records.length) {
        const next = recordChecks(extras.checks ?? createChecks(), records);
        if (next !== extras.checks) {
          extras.checks = next;
          void deps.persist();
          deps.notify();
        }
      }
      const landed = rewardsLanded(loaded.story, entry);
      if (landed.length) void dispatch(loaded.story, landed, entry);
    },
    outcomeBlock: (): string | null => {
      const loaded = deps.loaded();
      return loaded ? checkOutcomeBlock(loaded.story, deps.extras().checks?.records ?? [], deps.engine.serialize().lastMessageId) : null;
    },
  };
}