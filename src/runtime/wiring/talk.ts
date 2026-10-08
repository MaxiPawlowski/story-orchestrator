import { askText } from "@extraction/index";
import { getActiveCharacterId, getActiveGroup, getCharacterNameById, getContext, getPlayerName, startGroupVoice } from "@services/STAPI";
import { log } from "@utils/log";
import { gatedInterceptor } from "../loudGenerationGate";
import { CHAT_SETTLE_TIMEOUT_MS, chatSettle } from "../chatSettle";
import { spikeSeams } from "../spikeSeams";
import type { JudgeRuntime } from "../judge";
import { routedProfileId } from "../requestBudget";
import { runtimeManager } from "../runtimeManager";
import { DIRECTOR_MAX_TOKENS, TalkController, type TalkControlHost } from "../talkControl";
import { promptCost } from "../promptCost";
import type { LiveParts, WindowAccess } from "./types";
import { presentRosterIds } from "../whereabouts";

const talkHost = (live: LiveParts, judgeRuntime: JudgeRuntime, { chatLastId, recentTurns }: WindowAccess): TalkControlHost => ({
  isGroupChat: () => Boolean(getActiveGroup()),
  getChatId: () => getContext().chatId ?? null,
  getActiveTalkControl: () => runtimeManager.getActiveTalkControl(),
  getRoster: () => runtimeManager.getStory()?.roster ?? [],
  getEnabledRosterIds: () => presentRosterIds(runtimeManager.getStory(), runtimeManager.getEngineState()?.blackboard.values ?? {}, runtimeManager.getEnabledCharacterIds()),
  getLastSpeakerRosterId: () => runtimeManager.getActiveSpeakerId(),
  getDraftedRosterId: () => {
    const name = getCharacterNameById(getActiveCharacterId());
    return name ? runtimeManager.rosterIdForName(name) : null;
  },
  getLastMessageId: chatLastId,
  getWindow: recentTurns,
  getCheckpointInfo: () => runtimeManager.getActiveCheckpointInfo(),
  getPendingCheckpointId: () => runtimeManager.getPendingCheckpointId(),
  postsOpener: (id) => (runtimeManager.getStory()?.checkpointById[id]?.effects?.npc_replies ?? [])
    .some((reply) => reply.trigger === "onEnter" && reply.enabled !== false && reply.new_chat_only !== true),
  callDirector: (prompt, signal) => askText(runtimeManager.model, prompt, { role: "director", pass: "director", maxTokens: DIRECTOR_MAX_TOKENS, signal }),
  breakerOpen: () => live.scheduler?.breakerOpen(routedProfileId("director")) ?? false,
  triggerMember: startGroupVoice,
  recordDecision: (audit) => runtimeManager.recordTalkDecision(audit),
  judgeDirector: (input) => judgeRuntime.director(input),
  getPlayerName,
  random: () => runtimeManager.chance.talkRandom(),
  getChainConfig: () => runtimeManager.getTalkChainConfig(),
  setExtractionHold: (hold) => runtimeManager.setExtractionHold(hold),
  ownership: runtimeManager.getOwnership(),
});

const holdForChat = async (type: string) => {
  await holdForLoad();
  await spikeSeams.hold?.(type);
};

const holdForLoad = async () => {
  if (await chatSettle.until() !== "timed-out") return;
  log.warn("a reply started while this chat's story was still loading; it went ahead after the wait");
  const waited = `${CHAT_SETTLE_TIMEOUT_MS / 1000} s`;
  runtimeManager.noteRecap("a reply went ahead before this chat's story finished loading", `the load was still running after ${waited}, so cast and speaker direction may not have applied`);
};

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
  }, () => log.warn("speaker direction: a second reply started while one was already being written; it was stopped so the model is asked once"), holdForChat);
};
