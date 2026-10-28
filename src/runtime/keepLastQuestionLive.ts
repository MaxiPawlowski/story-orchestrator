import { readReplyText, rewriteReplyText } from "@services/STAPI";
import { keepLastQuestionPass } from "./keepLastQuestionPass";
import { replyRepairs } from "./replyRepairsLive";
import { runtimeManager } from "./runtimeManager";
import { getGlobalSettings } from "./settingsStore";

export const startLiveKeepLastQuestion = (): (() => void) => replyRepairs.add("keep-last", keepLastQuestionPass({
  enabled: () => getGlobalSettings().talk.keepLastQuestion,
  asking: (speaker) => runtimeManager.takeAskingPlayer(speaker),
  read: (messageId) => readReplyText(messageId),
  write: (messageId, text) => rewriteReplyText(messageId, text),
  journal: (summary, note) => runtimeManager.noteRecap(summary, note),
}));
