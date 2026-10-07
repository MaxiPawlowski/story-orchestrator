import { getContext, readReplyText, rewriteReplyText, subscribeToHostEvents } from "@services/STAPI";
import type { GenerationLifecycle } from "./generationLifecycle";
import { startReplyEffort } from "./replyEffortHost";
import { runtimeManager } from "./runtimeManager";
import { getGlobalSettings } from "./settingsStore";

export const startLiveReplyEffort = (generation: GenerationLifecycle): (() => void) => startReplyEffort({
  effort: () => getGlobalSettings().extraction.replyEffort,
  checkpointOverride: () => getGlobalSettings().spikes.reasoningEffect,
  storyChat: () => runtimeManager.getRunContext().chatId,
  openChat: () => getContext().chatId ?? null,
  checkpointId: () => runtimeManager.getActiveCheckpointInfo()?.id ?? null,
  story: () => runtimeManager.getStory(),
  generation: () => generation.snapshot(),
  journal: (summary, note) => runtimeManager.noteRecap(summary, note),
  replies: {
    observe: (handler) => subscribeToHostEvents([{ eventName: "MESSAGE_RECEIVED", handler: (messageId) => handler(Number(messageId)) }]),
    read: (messageId) => readReplyText(messageId),
    write: (messageId, text) => rewriteReplyText(messageId, text),
  },
});
