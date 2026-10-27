import { readReplyText, rewriteReplyText, subscribeToHostEvents } from "@services/STAPI";
import { keepLastQuestionPass } from "./keepLastQuestionPass";
import { onReplyReceived } from "./replyReceived";
import { runtimeManager } from "./runtimeManager";
import { getGlobalSettings } from "./settingsStore";

export const startLiveKeepLastQuestion = (): (() => void) => subscribeToHostEvents([{
  eventName: "MESSAGE_RECEIVED",
  handler: onReplyReceived(keepLastQuestionPass({
    enabled: () => getGlobalSettings().talk.keepLastQuestion,
    asking: (speaker) => runtimeManager.takeAskingPlayer(speaker),
    read: (messageId) => readReplyText(messageId),
    write: (messageId, text) => rewriteReplyText(messageId, text),
    journal: (summary, note) => runtimeManager.noteRecap(summary, note),
  })),
}]);
