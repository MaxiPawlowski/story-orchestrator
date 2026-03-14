import { storySessionStore } from "@store/storySessionStore";
import type { RuntimeHydrateResult, RuntimeWriteOptions, StorySessionStore } from "@store/storySessionStore";
import type { CheckpointStatus, RuntimeStoryState } from "@utils/story-state";
import { sanitizeChatKey } from "@utils/story-state";
import type { NormalizedStory } from "@utils/story-validator";

export type HydrateResult = RuntimeHydrateResult;

export interface PersistenceController {
  setStory(next: NormalizedStory | null | undefined): RuntimeStoryState;
  setChatContext(ctx: { chatId: string | null | undefined; groupChatSelected: boolean | null | undefined }): void;
  resetRuntime(): RuntimeStoryState;
  hydrate(): HydrateResult;
  writeRuntime(next: RuntimeStoryState, options?: RuntimeWriteOptions): RuntimeStoryState;
  setTurnsSinceEval(next: number, options?: { persist?: boolean }): RuntimeStoryState;
  setCheckpointTurnCount(next: number, options?: { persist?: boolean }): RuntimeStoryState;
  updateCheckpointStatus(index: number, status: CheckpointStatus, options?: { persist?: boolean }): RuntimeStoryState;
  dispose(): void;
  canPersist(): boolean;
  isHydrated(): boolean;
}

const getStoreActions = (store: StorySessionStore) => store.getState();

export const createPersistenceController = (store: StorySessionStore = storySessionStore): PersistenceController => {
  const setStory = (next: NormalizedStory | null | undefined): RuntimeStoryState => getStoreActions(store).setStory(next ?? null);

  const setChatContext = ({ chatId, groupChatSelected }: { chatId: string | null | undefined; groupChatSelected: boolean | null | undefined }) => {
    getStoreActions(store).setChatContext({
      chatId: sanitizeChatKey(chatId),
      groupChatSelected: Boolean(groupChatSelected),
    });
  };

  const resetRuntime = (): RuntimeStoryState => getStoreActions(store).resetRuntime();
  const hydrate = (): HydrateResult => getStoreActions(store).hydrateRuntime();
  const writeRuntime = (next: RuntimeStoryState, options: RuntimeWriteOptions = {}): RuntimeStoryState => getStoreActions(store).writeRuntime(next, options);
  const setTurnsSinceEval = (next: number, options?: { persist?: boolean }): RuntimeStoryState => getStoreActions(store).setTurnsSinceEval(next, options);
  const setCheckpointTurnCount = (next: number, options?: { persist?: boolean }): RuntimeStoryState => getStoreActions(store).setCheckpointTurnCount(next, options);
  const updateCheckpointStatus = (index: number, status: CheckpointStatus, options?: { persist?: boolean }): RuntimeStoryState => getStoreActions(store).updateCheckpointStatus(index, status, options);

  const dispose = () => {
    /* no-op: store already owns state */
  };

  const canPersist = () => getStoreActions(store).canPersistRuntime();
  const isHydrated = () => Boolean(getStoreActions(store).hydrated);

  return {
    setStory,
    setChatContext,
    resetRuntime,
    hydrate,
    writeRuntime,
    setTurnsSinceEval,
    setCheckpointTurnCount,
    updateCheckpointStatus,
    dispose,
    canPersist,
    isHydrated,
  };
};
