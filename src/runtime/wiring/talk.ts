import { askText } from "@extraction/index";
import { executeSlashCommands, getActiveCharacterId, getActiveGroup, getCharacterNameById, getContext, getPlayerName } from "@services/STAPI";
import { log } from "@utils/log";
import { gatedInterceptor } from "../loudGenerationGate";
import { quoteSlashArg } from "@utils/string";
import type { JudgeRuntime } from "../judge";
import { routedProfileId } from "../requestBudget";
import { runtimeManager } from "../runtimeManager";
import { DIRECTOR_MAX_TOKENS, TalkController, type TalkControlHost } from "../talkControl";
import { promptCost } from "../promptCost";
import type { LiveParts, WindowAccess } from "./types";

const talkHost = (live: LiveParts, judgeRuntime: JudgeRuntime, { chatLastId, recentTurns }: WindowAccess): TalkControlHost => ({
  isGroupChat: () => Boolean(getActiveGroup()),
  getChatId: () => getContext().chatId ?? null,
  getActiveTalkControl: () => runtimeManager.getActiveTalkControl(),
  getRoster: () => runtimeManager.getStory()?.roster ?? [],
  getEnabledRosterIds: () => runtimeManager.getEnabledCharacterIds(),
  getLastSpeakerRosterId: () => runtimeManager.getActiveSpeakerId(),
  getDraftedRosterId: () => {
    const name = getCharacterNameById(getActiveCharacterId());
    return name ? runtimeManager.rosterIdForName(name) : null;
  },
  getLastMessageId: chatLastId,
  getWindow: recentTurns,
  getCheckpointInfo: () => runtimeManager.getActiveCheckpointInfo(),
  callDirector: (prompt, signal) => askText(runtimeManager.model, prompt, { role: "director", pass: "director", maxTokens: DIRECTOR_MAX_TOKENS, signal }),
  breakerOpen: () => live.scheduler?.breakerOpen(routedProfileId("director")) ?? false,
  triggerMember: async (name) => { await executeSlashCommands(`/trigger await=true ${quoteSlashArg(name)}`, { silent: false }); },
  recordDecision: (audit) => runtimeManager.recordTalkDecision(audit),
  judgeDirector: (input) => judgeRuntime.director(input),
  getPlayerName,
  random: () => runtimeManager.chance.talkRandom(),
  getChainConfig: () => runtimeManager.getTalkChainConfig(),
  setExtractionHold: (hold) => runtimeManager.setExtractionHold(hold),
  ownership: runtimeManager.getOwnership(),
});

export const startTalk = (live: LiveParts, judgeRuntime: JudgeRuntime, window: WindowAccess, onLoreIntercept: (type: string, aborted: boolean) => Promise<void>) => {
  live.talk = new TalkController(talkHost(live, judgeRuntime, window));
  globalThis.talkControlInterceptor = gatedInterceptor(live.loudGate, () => Boolean(getActiveGroup()), async (chat, contextSize, abort, type) => {
    promptCost.noteGenerationBudget(contextSize);
    let aborted = false;
    await live.talk?.intercept((immediate) => { aborted = true; abort(immediate); }, type);
    await onLoreIntercept(type, aborted);
    if (!aborted && Array.isArray(chat)) await runtimeManager.chapters.recall(chat, type);
    const folded = !aborted && Array.isArray(chat) ? runtimeManager.chapters.fold(chat, type, getContext().chat ?? []) : null;
    if (folded) runtimeManager.noteFolded(folded.folded);
  }, () => log.warn("speaker direction: a second reply started while one was already being written; it was stopped so the model is asked once"));
};
