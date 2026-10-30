import { getContext, readReplyText, rewriteReplyText } from "@services/STAPI";
import { historyNoteEchoPass, historyNotesPass, type HistoryNoteDeps, type NoteRow } from "./historyNotes";
import { replyRepairs } from "./replyRepairsLive";
import { runtimeManager } from "./runtimeManager";

const deps: HistoryNoteDeps = {
  enabled: () => runtimeManager.getEffectiveSettings().memory.historyNotes === true,
  chatId: () => getContext().chatId ?? null,
  ownedChat: () => runtimeManager.getLoadedChatId(),
  story: () => runtimeManager.getStory(),
  log: () => runtimeManager.getBoundaryLog(),
  live: () => getContext().chat ?? [],
  resting: () => (text: string) => runtimeManager.memoryActions.restingText(text),
};

const pass = historyNotesPass(deps);

export const applyLiveHistoryNotes = (rows: NoteRow[], type: string, withheld: boolean): number => pass.apply(rows, type, withheld);

export const startLiveHistoryNotes = (): (() => void) => replyRepairs.add("history-note", historyNoteEchoPass({
  ...deps,
  read: (messageId) => readReplyText(messageId),
  write: (messageId, text) => rewriteReplyText(messageId, text),
  journal: (summary, note) => runtimeManager.noteRecap(summary, note),
}, pass.cache));
