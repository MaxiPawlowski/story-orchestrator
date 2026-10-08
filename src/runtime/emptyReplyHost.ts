import { getContext, isHostGenerating, readReasoningTags, swipeForNewReply } from "@services/STAPI";
import { EmptyReplyRecovery, residueTags } from "./emptyReply";
import { runtimeManager } from "./runtimeManager";
import { publishSpikeDebug } from "./spikeDebug";
import type { TurnBridge } from "./turnBridge";

const liveTags = () => residueTags(readReasoningTags());

export function startEmptyReplyRecovery(bridge: TurnBridge, chainPending: () => boolean): () => void {
  const recovery = new EmptyReplyRecovery({
    storyChat: () => (runtimeManager.getStory() ? runtimeManager.getLoadedChatId() : null),
    openChat: () => getContext().chatId ?? null,
    row: (messageId) => (getContext().chat as unknown[] | undefined)?.[messageId],
    chatLength: () => (getContext().chat as unknown[] | undefined)?.length ?? 0,
    busy: () => isHostGenerating() || chainPending(),
    askAgain: (messageId, row) => swipeForNewReply(messageId, row),
    ownership: () => runtimeManager.getOwnership(),
    journal: (summary, note) => runtimeManager.noteRecap(summary, note),
    tags: liveTags,
  });
  bridge.setEmptyReplySeam({ tags: liveTags, observe: (messageId, type) => void recovery.observe(messageId, type) });
  const unpublish = publishSpikeDebug({ emptyReply: recovery.debug() });
  return () => {
    bridge.setEmptyReplySeam(null);
    unpublish();
  };
}
