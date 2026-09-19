import { callExtractionModel, getChatWindow, ExtractionScheduler, type SchedulerHost, type SchedulerSettings } from "@extraction/index";
import { INJECTION_REGISTRY } from "@constants/injectionRegistry";
import { clearStoryExtensionPrompt, executeSlashCommands, getActiveCharacterId, getActiveGroup, getCharacterNameById, getContext, getPlayerName, judgeStatus, judgeTransport, setStoryExtensionPrompt, subscribeToHostEvents, type HostSubscriptionEntry } from "@services/STAPI";
import { quoteSlashArg } from "@utils/string";
import { runBoundaryWork } from "./boundaryWork";
import { SceneCoordinator } from "./coordinators/sceneCoordinator";
import { JudgeRuntime } from "./judge";
import { getGlobalSettings } from "./settingsStore";
import { registerLiveSuite } from "./liveSuite";
import { registerRuntimeMacros } from "./macros";
import { runtimeManager } from "./runtimeManager";
import { registerSlashCommands } from "./slashCommands";
import { DIRECTOR_MAX_TOKENS, DIRECTOR_WINDOW_MESSAGES, TalkController, type TalkControlHost } from "./talkControl";
import { TurnBridge } from "./turnBridge";

let started = false;
let bridge: TurnBridge | null = null;
let slashRegistered = false;
let scheduler: ExtractionScheduler | null = null;
let privateInjectionUnsub: (() => void) | null = null;
let talkController: TalkController | null = null;
let sceneCoordinator: SceneCoordinator | null = null;

const registerSlashCommandsWhenReady = (attempt = 0) => {
  if (slashRegistered) return;
  try {
    slashRegistered = registerSlashCommands(runtimeManager);
  } catch (error) {
    console.warn("[Story Orchestrator] slash command registration failed", error);
  }
  if (!slashRegistered && attempt < 100) window.setTimeout(() => registerSlashCommandsWhenReady(attempt + 1), 100);
};

export function startRuntime() {
  if (started) return runtimeManager;
  started = true;
  const schedulerHost: SchedulerHost = {
    getStory: () => runtimeManager.getStory(),
    getEngineState: () => runtimeManager.getEngineState(),
    getExtractionSettings: (): SchedulerSettings => ({
      ...runtimeManager.getExtractionSettings(),
      debugResponse: globalThis.storyOrchestratorDebugExtractionResponse ?? null,
    }),
    getFacts: () => runtimeManager.getExtractionFacts(),
    getFiredTransitions: () => runtimeManager.getFiredTransitions(),
    getExpansionGateSources: () => runtimeManager.getExpansionGateSources(),
    getOpenArcs: () => runtimeManager.getOpenArcs(),
    getEpistemicLedgerCapable: () => runtimeManager.getEpistemicLedgerCapable(),
    getEntities: () => runtimeManager.getEntities(),
    applyExtractionAudit: (audit, facts, memory, arcs, epistemic, ledger) => runtimeManager.applyExtractionAudit(audit, facts, memory, arcs, epistemic, ledger),
    onSchedulerChange: () => {
      if (scheduler) runtimeManager.setSchedulerSnapshot(scheduler.getSnapshot());
    },
    pauseExtraction: (message) => runtimeManager.pauseExtraction(message),
  };
  scheduler = new ExtractionScheduler(schedulerHost);
  runtimeManager.onBoundary((result) => {
    if (scheduler) runBoundaryWork({ result, manager: runtimeManager, scheduler, ...(sceneCoordinator ? { scene: sceneCoordinator } : {}) });
  });
  runtimeManager.onRollback((messageId, window) => {
    scheduler?.schedule({ priority: 0, reason: `rollback:${messageId}`, window });
  });
  runtimeManager.onSceneBreakConfirmed((audit) => {
    scheduler?.schedule({ priority: 2, reason: `scene-break:${audit.sceneBreak?.reason}`, run: () => runtimeManager.runSceneBreakPass(audit) });
    if (runtimeManager.getEpistemicLedgerCapable()) {
      scheduler?.schedule({ priority: 2, reason: `epistemic-ledger:${audit.sceneBreak?.reason}`, run: async () => { await runtimeManager.runEpistemicLedgerPass(audit); } });
    }
    if (runtimeManager.curatorDueForRun()) {
      scheduler?.schedule({ priority: 4, reason: `wi-curator:scene-${audit.sceneBreak?.reason}`, run: async () => { await runtimeManager.runWiCuratorPass("scene-break"); } });
    }
  });
  runtimeManager.onArcsResolvedConfirmed((arcIds) => {
    scheduler?.schedule({ priority: 4, reason: `arc-summary:${arcIds.length}`, run: async () => { await runtimeManager.runArcSummaryPass(arcIds); } });
  });
  registerRuntimeMacros(runtimeManager);
  registerLiveSuite(runtimeManager);
  window.setTimeout(() => registerSlashCommandsWhenReady(), 0);
  window.setTimeout(() => registerSlashCommandsWhenReady(), 1000);
  bridge = new TurnBridge(runtimeManager);
  bridge.start();
  const chatLastId = () => (Array.isArray(getContext().chat) ? getContext().chat.length - 1 : -1);
  const judgeRuntime = new JudgeRuntime({
    getSettings: () => getGlobalSettings().judge,
    transport: judgeTransport,
    status: judgeStatus,
    record: (record) => runtimeManager.recordJudgeCall(record),
    context: () => ({ boundary: runtimeManager.getEngineState()?.boundary ?? 0, messageId: chatLastId() }),
  });
  globalThis.storyOrchestratorJudge = judgeRuntime;
  runtimeManager.attachJudge(judgeRuntime);
  const recentWindow = () => {
    const chat = Array.isArray(getContext().chat) ? getContext().chat : [];
    return getChatWindow(Math.max(0, chat.length - DIRECTOR_WINDOW_MESSAGES)).messages.map((message) => ({ speaker: message.speaker, text: message.text }));
  };
  const tracker = INJECTION_REGISTRY.sceneTracker;
  const scene = new SceneCoordinator({
    judge: () => judgeRuntime,
    getStory: () => runtimeManager.getStory(),
    getState: () => runtimeManager.getEngineState(),
    getWindow: recentWindow,
    getPlayerName,
    getLastMessageId: chatLastId,
    getScene: () => runtimeManager.getSceneRead(),
    setScene: (record) => runtimeManager.recordSceneRead(record),
    inject: (text) => (text ? setStoryExtensionPrompt(tracker.key, text, tracker.depth) : clearStoryExtensionPrompt(tracker.key)),
  });
  sceneCoordinator = scene;
  runtimeManager.subscribe(() => scene.sync());
  const talkHost: TalkControlHost = {
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
    getWindow: recentWindow,
    getCheckpointInfo: () => runtimeManager.getActiveCheckpointInfo(),
    callDirector: (prompt) => callExtractionModel(prompt, {
      profileId: runtimeManager.getExtractionSettings().profileId,
      maxTokens: DIRECTOR_MAX_TOKENS,
      debugResponse: globalThis.storyOrchestratorDebugDirectorResponse ?? null,
    }),
    triggerMember: async (name) => { await executeSlashCommands(`/trigger await=true ${quoteSlashArg(name)}`, { silent: false }); },
    recordDecision: (audit) => runtimeManager.recordTalkDecision(audit),
    judgeDirector: (input) => judgeRuntime.director(input),
    getPlayerName,
  };
  talkController = new TalkController(talkHost);
  globalThis.talkControlInterceptor = (_chat, _contextSize, abort, type) => talkController?.intercept(abort, type);
  const privateInjectionEntries: HostSubscriptionEntry[] = [
    { eventName: "GROUP_MEMBER_DRAFTED", handler: (characterId) => runtimeManager.onMemberDrafted(characterId as number | [number]) },
    { eventName: "GENERATION_STARTED", handler: (...args: unknown[]) => { runtimeManager.onGenerationStarted(args[0]); runtimeManager.capturePayload(); talkController?.onGenerationStarted(args[1] as Record<string, unknown> | undefined); } },
    { eventName: "GENERATION_ENDED", handler: () => { runtimeManager.clearPrivateInjection(); runtimeManager.clearCopilotNudge(); talkController?.onGenerationEnded(); } },
    { eventName: "GENERATION_STOPPED", handler: () => { runtimeManager.clearPrivateInjection(); runtimeManager.clearCopilotNudge(); talkController?.onGenerationEnded(); } },
    { eventName: "GROUP_WRAPPER_STARTED", handler: (payload) => talkController?.onWrapperStarted(payload as Record<string, unknown> | undefined) },
    { eventName: "GROUP_WRAPPER_FINISHED", handler: () => { void talkController?.onWrapperFinished(); } },
  ];
  privateInjectionUnsub = subscribeToHostEvents(privateInjectionEntries);
  void runtimeManager.loadSelectedFromChat();
  return runtimeManager;
}

export function stopRuntime() {
  bridge?.stop();
  bridge = null;
  privateInjectionUnsub?.();
  privateInjectionUnsub = null;
  scheduler = null;
  talkController = null;
  sceneCoordinator = null;
  globalThis.talkControlInterceptor = () => undefined;
  started = false;
}

export { runtimeManager };
export type { RuntimeManager } from "./runtimeManager";
