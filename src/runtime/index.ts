import { callExtractionModel, getChatWindow, ExtractionScheduler, type SchedulerHost, type SchedulerSettings } from "@extraction/index";
import { INJECTION_REGISTRY } from "@constants/injectionRegistry";
import { sceneFieldsInConflict } from "@memory/index";
import { clearStoryExtensionPrompt, executeSlashCommands, forceActivateEntries, getActiveCharacterId, getActiveGroup, getCharacterNameById, getContext, getPlayerName, getScannableEntries, judgeStatus, judgeTransport, noteHostSettingsLoaded, setStoryExtensionPrompt, settingsReady, subscribeToHostEvents, willAddUserMessage, EXTENSION_SETTINGS_LOADED_EVENT, type HostSubscriptionEntry } from "@services/STAPI";
import { quoteSlashArg } from "@utils/string";
import { runBoundaryWork } from "./boundaryWork";
import { SceneCoordinator } from "./coordinators/sceneCoordinator";
import { JudgeRuntime } from "./judge";
import { LoreSelector } from "./loreSelect";
import { createTypedJudge } from "./typedRead";
import { getGlobalSettings } from "./settingsStore";
import { registerLiveSuite } from "./liveSuite";
import { registerRuntimeMacros } from "./macros";
import { startMirrorReaper } from "./mirrorReaperHost";
import { runtimeManager } from "./runtimeManager";
import { beginRun } from "./runToken";
import { registerSlashCommands } from "./slashCommands";
import { DIRECTOR_MAX_TOKENS, DIRECTOR_WINDOW_MESSAGES, TalkController, type TalkControlHost } from "./talkControl";
import { GenerationLifecycle, type GenerationIntent } from "./generationLifecycle";
import { isTurnMessageType, TurnBridge } from "./turnBridge";

let started = false;
let bridge: TurnBridge | null = null;
let slashRegistered = false;
let scheduler: ExtractionScheduler | null = null;
let privateInjectionUnsub: (() => void) | null = null;
let talkController: TalkController | null = null;
let sceneCoordinator: SceneCoordinator | null = null;
let typedJudge: ReturnType<typeof createTypedJudge> | null = null;
// v2.3 plan 03: every subscription startRuntime makes, so stopRuntime can undo it. Without this a
// stop/start cycle left the previous run listening, and each boundary dispatched twice — once into
// live wiring and once into a scheduler and scene coordinator that had already been torn down.
const runtimeDisposers: Array<() => void> = [];

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
    applyExtractionAudit: (audit, facts, memory, arcs, epistemic, ledger, read) => runtimeManager.applyExtractionAudit(audit, facts, memory, arcs, epistemic, ledger, read),
    beginRead: (window) => beginRun(runtimeManager.getOwnership(), window),
    onSchedulerChange: () => {
      if (scheduler) runtimeManager.setSchedulerSnapshot(scheduler.getSnapshot());
    },
    pauseExtraction: (message) => runtimeManager.pauseExtraction(message),
    epoch: () => runtimeManager.getRunContext().sessionEpoch,
    judgeTyped: () => typedJudge,
  };
  scheduler = new ExtractionScheduler(schedulerHost);
  runtimeDisposers.push(runtimeManager.onBoundary((result) => {
    if (scheduler) runBoundaryWork({ result, manager: runtimeManager, scheduler, ...(sceneCoordinator ? { scene: sceneCoordinator } : {}) });
  }));
  runtimeDisposers.push(runtimeManager.onRollback((messageId, window) => {
    scheduler?.schedule({ priority: 0, reason: `rollback:${messageId}`, window });
  }));
  runtimeDisposers.push(runtimeManager.onSceneBreakConfirmed((audit) => {
    scheduler?.schedule({ priority: 2, reason: `scene-break:${audit.sceneBreak?.reason}`, run: () => runtimeManager.runSceneBreakPass(audit) });
    if (runtimeManager.getEpistemicLedgerCapable()) {
      scheduler?.schedule({ priority: 2, reason: `epistemic-ledger:${audit.sceneBreak?.reason}`, run: async () => { await runtimeManager.runEpistemicLedgerPass(audit); } });
    }
    if (runtimeManager.curatorDueForRun()) {
      scheduler?.schedule({ priority: 4, reason: `wi-curator:scene-${audit.sceneBreak?.reason}`, run: async () => { await runtimeManager.runWiCuratorPass("scene-break"); } });
    }
  }));
  runtimeDisposers.push(runtimeManager.onArcsResolvedConfirmed((arcIds) => {
    scheduler?.schedule({ priority: 4, reason: `arc-summary:${arcIds.length}`, run: async () => { await runtimeManager.runArcSummaryPass(arcIds); } });
  }));
  // A story load, select, restart, clear or chat change drops whatever was queued for the world
  // that just ended (v2.3 plan 03 §Abort and cleanup).
  runtimeDisposers.push(runtimeManager.onEpochChanged(() => scheduler?.clearForNewWorld()));
  // v2.3 plan 06. A build with no MacrosParser throws on the first registration, and this call sits
  // in the middle of startRuntime: unguarded, a missing macro engine would take the bridge, the judge,
  // lore selection and speaker direction down with it. The capability report is where it is shown.
  try {
    runtimeDisposers.push(registerRuntimeMacros(runtimeManager));
  } catch (error) {
    console.warn("[Story Orchestrator] host macros unavailable; {{story_*}} will not resolve", error);
  }
  registerLiveSuite(runtimeManager);
  window.setTimeout(() => registerSlashCommandsWhenReady(), 0);
  window.setTimeout(() => registerSlashCommandsWhenReady(), 1000);
  bridge = new TurnBridge(runtimeManager);
  bridge.start();
  runtimeDisposers.push(startMirrorReaper(() => runtimeManager.notify()));
  const chatLastId = () => (Array.isArray(getContext().chat) ? getContext().chat.length - 1 : -1);
  globalThis.storyOrchestratorScheduler = { nextReadWindow: () => scheduler?.nextReadWindow(chatLastId()) ?? null };
  const judgeRuntime = new JudgeRuntime({
    getSettings: () => getGlobalSettings().judge,
    transport: judgeTransport,
    status: judgeStatus,
    record: (record) => runtimeManager.recordJudgeCall(record),
    context: () => ({ boundary: runtimeManager.getEngineState()?.boundary ?? 0, messageId: chatLastId() }),
    // C1: a call started in one chat must not be recorded in another chat's ring.
    ownership: runtimeManager.getOwnership(),
  });
  globalThis.storyOrchestratorJudge = judgeRuntime;
  typedJudge = createTypedJudge(() => judgeRuntime);
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
    ownership: runtimeManager.getOwnership(),
    setScene: (record) => runtimeManager.recordSceneRead(record),
    inject: (text) => (text ? setStoryExtensionPrompt(tracker.key, text, tracker.depth) : clearStoryExtensionPrompt(tracker.key)),
    withheldFields: () => sceneFieldsInConflict(runtimeManager.getSnapshot().memory.conflicts),
  });
  sceneCoordinator = scene;
  runtimeManager.attachScene(scene);
  runtimeDisposers.push(() => runtimeManager.attachScene(null));
  runtimeDisposers.push(runtimeManager.subscribe(() => scene.sync()));
  const lore = new LoreSelector({
    judge: () => judgeRuntime,
    getStory: () => runtimeManager.getStory(),
    getState: () => runtimeManager.getEngineState(),
    getWindow: recentWindow,
    getChatId: () => getContext().chatId ?? null,
    getLastMessageId: chatLastId,
    getEntries: getScannableEntries,
    force: forceActivateEntries,
    ownership: runtimeManager.getOwnership(),
  });
  // v2.2 plan 04 seam: force at the last awaited event before a scan whose chat already holds the
  // message that triggered it. A generation about to add the player's message waits for MESSAGE_SENT.
  globalThis.storyOrchestratorLore = { selector: lore, willAddUserMessage };
  let loreAwaitsMessage = false;
  const selectLore = (trigger: "MESSAGE_SENT" | "GENERATION_STARTED") => lore.select(trigger).catch((error) => console.warn("[Story Orchestrator] lore-select failed", error));
  const onLoreGenerationStarted = async (type: string | undefined, params: Record<string, unknown> | undefined, dryRun: boolean | undefined) => {
    loreAwaitsMessage = false;
    if (!lore.active() || dryRun || type === "quiet" || params?.quiet_prompt) return;
    if (willAddUserMessage(type, params, dryRun)) loreAwaitsMessage = true;
    else await selectLore("GENERATION_STARTED");
  };
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
    ownership: runtimeManager.getOwnership(),
  };
  talkController = new TalkController(talkHost);
  globalThis.talkControlInterceptor = (_chat, _contextSize, abort, type) => talkController?.intercept(abort, type);
  const generation = new GenerationLifecycle(isTurnMessageType);
  const applyGeneration = (intents: GenerationIntent[]) => {
    for (const intent of intents) {
      if (intent.kind === "opened") {
        runtimeManager.onGenerationStarted(intent.type);
        runtimeManager.capturePayload();
        talkController?.onGenerationStarted(intent.params);
      } else if (intent.kind === "nested" && intent.withholds) {
        runtimeManager.onGenerationStarted(intent.type);
      } else if (intent.kind === "nested") {
        runtimeManager.capturePayload();
        talkController?.onGenerationStarted(intent.params);
      } else if (intent.kind === "reapply") {
        runtimeManager.clearPrivateInjection();
        if (intent.chid !== null) runtimeManager.onMemberDrafted(intent.chid);
      } else if (intent.kind === "closed") {
        if (intent.reason !== "chat-changed") {
          runtimeManager.clearPrivateInjection();
          runtimeManager.clearCopilotNudge();
        }
        talkController?.onGenerationEnded();
      } else {
        runtimeManager.commitContinuityNote(intent.rendered);
      }
    }
  };
  const privateInjectionEntries: HostSubscriptionEntry[] = [
    { eventName: "GROUP_MEMBER_DRAFTED", handler: (characterId) => { generation.drafted(characterId); runtimeManager.onMemberDrafted(characterId as number | [number]); } },
    { eventName: "GENERATION_STARTED", handler: async (...args: unknown[]) => { applyGeneration(generation.started(args, chatLastId() + 1)); await onLoreGenerationStarted(typeof args[0] === "string" ? args[0] : undefined, args[1] as Record<string, unknown> | undefined, args[2] === true); } },
    { eventName: "MESSAGE_SENT", handler: async () => { if (!loreAwaitsMessage) return; loreAwaitsMessage = false; await selectLore("MESSAGE_SENT"); } },
    { eventName: "GENERATION_ENDED", handler: (...args: unknown[]) => applyGeneration(generation.ended(args)) },
    { eventName: "GENERATION_STOPPED", handler: (...args: unknown[]) => applyGeneration(generation.stopped(args)) },
    { eventName: "MESSAGE_RECEIVED", handler: (messageId, type) => applyGeneration(generation.rendered(messageId, type)) },
    { eventName: "CHARACTER_MESSAGE_RENDERED", handler: (messageId, type) => applyGeneration(generation.rendered(messageId, type)) },
    { eventName: "CHAT_CHANGED", handler: () => applyGeneration(generation.chatChanged()) },
    { eventName: "GROUP_WRAPPER_STARTED", handler: (payload) => talkController?.onWrapperStarted(payload as Record<string, unknown> | undefined) },
    { eventName: "GROUP_WRAPPER_FINISHED", handler: () => { void talkController?.onWrapperFinished(); } },
    // v2.3 plan 06 (F2): ST writes the third-party settings and THEN emits this, so it is the one
    // proof that `extension_settings` holds real values. The chat that was waiting on the gate loads
    // here, once, and never twice.
    { eventName: EXTENSION_SETTINGS_LOADED_EVENT, handler: () => { noteHostSettingsLoaded(); void runtimeManager.loadSelectedFromChat(); } },
  ];
  privateInjectionUnsub = subscribeToHostEvents(privateInjectionEntries);
  // v2.3 plan 06 (F2). Versioned settings (loaded synchronously from a cache) are already in place,
  // so the gate opens now and the chat loads now; a page still fetching them opens it on the event.
  // Either way the load happens exactly once, because the gate resolves once.
  void settingsReady().then(() => {
    if (runtimeManager.getSnapshot().ready) return;
    // `?.` on purpose: a host seam that is absent (a partial stub, or a build without it) must not
    // turn the load into an unhandled rejection — the load is the point, the gate is bookkeeping.
    noteHostSettingsLoaded?.();
    void runtimeManager.loadSelectedFromChat();
  });
  return runtimeManager;
}

export function stopRuntime() {
  bridge?.stop();
  bridge = null;
  runtimeManager.invalidateRuns();
  privateInjectionUnsub?.();
  privateInjectionUnsub = null;
  // Each one try/caught: a listener that throws on disposal must not strand the ones after it
  // still registered, which would leave exactly the double-dispatch this is here to prevent.
  for (const dispose of runtimeDisposers.splice(0)) {
    try {
      dispose();
    } catch (error) {
      console.warn("[Story Orchestrator] a runtime subscription failed to dispose", error);
    }
  }
  scheduler = null;
  talkController = null;
  sceneCoordinator = null;
  globalThis.talkControlInterceptor = () => undefined;
  globalThis.storyOrchestratorScheduler = undefined;
  started = false;
}

export { runtimeManager };
export type { RuntimeManager } from "./runtimeManager";
