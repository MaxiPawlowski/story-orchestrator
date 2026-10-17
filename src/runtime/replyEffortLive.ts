import { getContext, readReplyText, rewriteReplyText, subscribeToHostEvents } from "@services/STAPI";
import type { GenerationLifecycle } from "./generationLifecycle";
import { startReplyEffort } from "./replyEffortHost";
import { runtimeManager } from "./runtimeManager";
import { getGlobalSettings } from "./settingsStore";
import { onReplyReceived } from "./replyReceived";
import { isReplyEffort } from "@utils/reasoningEffort";

export const startLiveReplyEffort = (generation: GenerationLifecycle): (() => void) => startReplyEffort({
  effort: () => getGlobalSettings().extraction.replyEffort,
  checkpointOverride: () => getGlobalSettings().spikes.reasoningEffect,
  masterOff: () => runtimeManager.getSnapshot().features?.thinking.masterOff ?? false,
  override: () => {
    const feature = runtimeManager.getSnapshot().features?.thinking;
    if (!feature) return undefined;
    const effort = feature.controls.effort;
    if (!feature.enabled && feature.source === "chat") return "off";
    return (effort.source === "chat" || feature.reenabled) && isReplyEffort(effort.value) ? effort.value : undefined;
  },
  storyChat: () => runtimeManager.getRunContext().chatId,
  openChat: () => getContext().chatId ?? null,
  checkpointId: () => runtimeManager.getActiveCheckpointInfo()?.id ?? null,
  story: () => runtimeManager.getStory(),
  generation: () => generation.snapshot(),
  journal: (summary, note) => runtimeManager.noteRecap(summary, note),
  replies: {
    observe: (handler) => subscribeToHostEvents([{ eventName: "MESSAGE_RECEIVED", handler: onReplyReceived(handler) }]),
    read: (messageId) => readReplyText(messageId),
    write: (messageId, text) => rewriteReplyText(messageId, text),
  },
});
