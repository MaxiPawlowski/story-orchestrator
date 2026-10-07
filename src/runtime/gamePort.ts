import { questRewardKey, type BoundaryLogEntry, type BoundaryResult, type NormalizedStoryV2, type StoryEngine } from "@engine/index";
import { gameLayer } from "@engine/validate/gameLayer";
import type { EarnedEffects, EffectsApplier } from "./effectsApplier";
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

const rewardsLanded = (story: NormalizedStoryV2, entry: BoundaryLogEntry): EarnedEffects[] => (story.quests ?? []).flatMap((quest) => {
  const key = questRewardKey(quest.id);
  const effects = quest.reward?.effects;
  return effects && entry.before.blackboard.values[key] !== true && entry.after.blackboard.values[key] === true
    ? [{ kind: "quest" as const, id: quest.id, name: quest.title, effects }] : [];
});

const agendaLanded = (story: NormalizedStoryV2, entry: BoundaryLogEntry): EarnedEffects[] => (story.life
  ? gameLayer()?.life.landedSteps(story, entry.before.blackboard.values, entry.after.blackboard.values) ?? [] : [])
  .flatMap((landed) => (landed.step.effect
    ? [{ kind: "agenda" as const, id: `${landed.memberId}:${landed.agendaId}:${landed.index}`, name: landed.agendaId, effects: landed.step.effect }] : []));

export function createGamePort(deps: GamePortDeps) {
  const dispatch = async (story: NormalizedStoryV2, landed: EarnedEffects[], entry: BoundaryLogEntry) => {
    const run = beginRun(deps.ownership);
    const path = stagedPath(deps.engine.checkpointPath, deps.engine.serialize().stagedFrom);
    const at = { checkpointId: null, boundary: entry.boundary, messageId: entry.context.lastMessageId };
    await deps.effects().applyEarnedEffects(story, landed, deps.extras(), entry.after.blackboard.values, path, at, run);
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
      const landed = [...rewardsLanded(loaded.story, entry), ...agendaLanded(loaded.story, entry)];
      if (landed.length) void dispatch(loaded.story, landed, entry);
    },
    outcomeBlock: (): string | null => {
      const loaded = deps.loaded();
      return loaded ? checkOutcomeBlock(loaded.story, deps.extras().checks?.records ?? [], deps.engine.serialize().lastMessageId) : null;
    },
  };
}