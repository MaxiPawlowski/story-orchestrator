import { getContext, getPlayerName, readReplyText, rewriteReplyText } from "@services/STAPI";
import { crossVoicePass } from "./crossVoicePass";
import { replyRepairs } from "./replyRepairsLive";
import { runtimeManager } from "./runtimeManager";
import { getGlobalSettings } from "./settingsStore";

export const startLiveCrossVoice = (): (() => void) => replyRepairs.add("cross-voice", crossVoicePass({
  enabled: () => getGlobalSettings().talk.crossVoiceTrim,
  storyChat: () => {
    const open = getContext().chatId ?? null;
    return open !== null && open === runtimeManager.getLoadedChatId();
  },
  story: () => runtimeManager.getStory(),
  player: () => getPlayerName(),
  read: (messageId) => readReplyText(messageId),
  write: (messageId, text) => rewriteReplyText(messageId, text),
  journal: (summary, note) => runtimeManager.noteRecap(summary, note),
}));
