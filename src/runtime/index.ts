import { callExtractionModel, getChatWindow, ExtractionScheduler, probeModel, setAnsweredObserver, setProfileRouter, type SchedulerHost, type SchedulerJob, type SchedulerSettings } from "@extraction/index";
import { INJECTION_REGISTRY } from "@constants/injectionRegistry";
import { sceneFieldsInConflict } from "@memory/index";
import { clearStoryExtensionPrompt, countTokens, executeSlashCommands, forceActivateEntries, getActiveCharacterId, getActiveGroup, getCharacterNameById, getContext, getPlayerName, getScannableEntries, judgeStatus, judgeTransport, noteHostSettingsLoaded, profileExists, readExtensionPromptBlocks, readInjectedPromptBlocks, readPromptBudget, setStoryExtensionPrompt, settingsReady, subscribeToHostEvents, willAddUserMessage, EXTENSION_SETTINGS_LOADED_EVENT, type HostSubscriptionEntry } from "@services/STAPI";
import { breakerWatchEntries } from "./breakerWatch";
import { quoteSlashArg } from "@utils/string";
import { runBoundaryWork } from "./boundaryWork";
import { SceneCoordinator } from "./coordinators/sceneCoordinator";
import { JudgeRuntime } from "./judge";
import { LoreSelector } from "./loreSelect";
import { createTypedJudge } from "./typedRead";
import { getGlobalSettings } from "./settingsStore";
import { registerLiveSuite } from "./liveSuite";
import { registerRuntimeMacros } from "./macros";
import { requestBudget, routedProfileId } from "./requestBudget";
import { resolveProfile } from "./passProfiles";
import { startMirrorReaper } from "./mirrorReaperHost";
import { runtimeManager } from "./runtimeManager";
import { beginRun } from "./runToken";
import { registerSlashCommands } from "./slashCommands";
import { DIRECTOR_MAX_TOKENS, DIRECTOR_WINDOW_MESSAGES, TalkController, type TalkControlHost } from "./talkControl";
import { GenerationLifecycle, type GenerationIntent } from "./generationLifecycle";
import { generationWatch } from "./generationWatch";
import { isTurnMessageType, TurnBridge } from "./turnBridge";
import { RequirementsWatch } from "./requirementsWatch";
import { currentChat, loadAtStartup } from "./chatIdentity";
import { journalSettingsWrite, onSettingsWrite, scopeToOpenChat, type SettingsWrite } from "./librarySave";
import { onChatWrite } from "./persistence";
import { onWizardSessionSave } from "./wizardSessions";
import { loreEvidence } from "./worldInfoEvidence";
import { startLoreEvidence } from "./worldInfoEvidenceHost";
import { startSamplerOverlay } from "./samplerOverlayHost";
import { startScanGating } from "./worldInfoScanHost";
import { promptCost } from "./promptCost";
import { roleHealth } from "./roleHealth";

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

const startupLoad = () => loadAtStartup({ load: () => runtimeManager.loadSelectedFromChat(), ownership: () => runtimeManager.getOwnership(), loaded: (chat) => bridge?.noteLoaded(chat) });

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
  runtimeDisposers.push(setProfileRouter((role, fallback) => resolveProfile({ ...runtimeManager.getExtractionSettings(), profileId: fallback }, role, profileExists)));
  runtimeDisposers.push(setAnsweredObserver((call) => scheduler?.noteAnswered(call.profileId, call.ms)));
  const schedulerHost: SchedulerHost = {
    getStory: () => runtimeManager.getStory(),
    getEngineState: () => runtimeManager.getEngineState(),
    getExtractionSettings: (): SchedulerSettings => ({
      ...runtimeManager.getExtractionSettings(),
      profileId: routedProfileId("read"),
      debugResponse: globalThis.storyOrchestratorDebugExtractionResponse ?? null,
      budget: requestBudget(routedProfileId("read")),
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
    noteLapse: (summary, detail) => runtimeManager.noteRecap(summary, detail),
    noteHealth: (summary, detail) => runtimeManager.noteRecap(summary, detail),
    probeModel,
    profileExists,
    mutationSettled: () => runtimeManager.rollbackSettled(),
    epoch: () => runtimeManager.getRunContext().sessionEpoch,
    judgeTyped: () => typedJudge,
  };
  scheduler = new ExtractionScheduler(schedulerHost);
  runtimeManager.attachScheduler(scheduler);
  runtimeDisposers.push(() => { scheduler?.dispose(); runtimeManager.attachScheduler(null); });
  runtimeDisposers.push(subscribeToHostEvents(breakerWatchEntries(() => scheduler, () => routedProfileId("read"))));
  runtimeDisposers.push(runtimeManager.onBoundary((result) => {
    if (scheduler) runBoundaryWork({ result, manager: runtimeManager, scheduler, ...(sceneCoordinator ? { scene: sceneCoordinator } : {}) });
  }));
  runtimeDisposers.push(runtimeManager.onRollback((messageId, window) => {
    scheduler?.schedule({ priority: 0, reason: `rollback:${messageId}`, window });
  }));
  runtimeDisposers.push(runtimeManager.onSceneBreakConfirmed((audit, collect) => {
    const place = (job: SchedulerJob) => (collect ? collect.push(job) : scheduler?.schedule(job));
    place({ priority: 2, reason: `scene-break:${audit.sceneBreak?.reason}`, run: () => runtimeManager.runSceneBreakPass(audit) });
    if (runtimeManager.getEpistemicLedgerCapable()) {
      place({ priority: 2, reason: `epistemic-ledger:${audit.sceneBreak?.reason}`, run: async () => { await runtimeManager.runEpistemicLedgerPass(audit); } });
    }
    if (runtimeManager.curatorDueForRun()) {
      place({ priority: 4, reason: `wi-curator:scene-${audit.sceneBreak?.reason}`, run: async () => { await runtimeManager.runWiCuratorPass("scene-break"); } });
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
  bridge = new TurnBridge(runtimeManager, runtimeManager.chatSave);
  bridge.start();
  // v2.4 plan 02 §8: persona, group and lorebook-selection changes re-read the requirements between turns.
  const requirementsWatch = new RequirementsWatch(runtimeManager.requirementsHost, subscribeToHostEvents);
  requirementsWatch.start();
  runtimeDisposers.push(() => requirementsWatch.stop());
  runtimeDisposers.push(startMirrorReaper(() => runtimeManager.notify()));
  // v2.4 E3: chat writes outside persist, and wizard-session writes, read the save they asked for.
  runtimeDisposers.push(onChatWrite((write) => void runtimeManager.chatSave.recordWrite(write)));
  const journalInstallWrite = (save: SettingsWrite) => void journalSettingsWrite(save.summary, save.label, save.evidence, scopeToOpenChat(currentChat), (summary, note) => runtimeManager.noteRecap(summary, note));
  runtimeDisposers.push(onWizardSessionSave(journalInstallWrite));
  runtimeDisposers.push(onSettingsWrite(journalInstallWrite));
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
    applied: () => readInjectedPromptBlocks().find((block) => block.key === tracker.key)?.value ?? null,
    withheldFields: () => sceneFieldsInConflict(runtimeManager.getSnapshot().memory.conflicts),
    journal: (summary, note) => runtimeManager.noteRecap(summary, note),
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
  // v2.4 plan 05 T12: what the scans of each loud generation actually activated, and the two misses
  // worth an author's attention. It follows plan 01's outermost-generation tracker, never raw events.
  const loreWatch = startLoreEvidence({
    chatId: () => getContext().chatId ?? null,
    context: () => runtimeManager.getRunContext(),
    story: () => runtimeManager.getStory(),
    state: () => runtimeManager.getEngineState(),
    mirrorBook: () => runtimeManager.getSnapshot().memory.wiBook?.name ?? null,
    lastMessageId: chatLastId,
    innermostType: () => {
      const open = generation.snapshot();
      return open.nested.length ? open.nested[open.nested.length - 1] : open.outermost?.type ?? null;
    },
    journal: (flag) => runtimeManager.noteRecap(flag.summary, flag.detail, "lore"),
    notify: () => runtimeManager.notify(),
  });
  runtimeDisposers.push(() => loreWatch.dispose());
  runtimeDisposers.push(startSamplerOverlay({ chatId: () => getContext().chatId ?? null, generation: () => generation.snapshot(), journal: (summary, note) => runtimeManager.noteRecap(summary, note) }));
  globalThis.storyOrchestratorLoreEvidence = loreEvidence;
  // v2.4 plan 05 T13 spike: inert unless `worldInfo.gatingMode` is "scan" (default "file"). The flag
  // is install-wide, so it is read once the extension settings have loaded, never before.
  let scanGating: ReturnType<typeof startScanGating> | null = null;
  let scanGatingDisposed = false;
  void settingsReady().then(() => {
    if (scanGatingDisposed || scanGating) return;
    scanGating = startScanGating({
      chatId: () => getContext().chatId ?? null,
      ownedChat: () => runtimeManager.getRunContext().claimedChat ?? null,
      story: () => runtimeManager.getStory(),
      path: () => runtimeManager.getEngineState()?.visitedPath ?? [],
      ownership: runtimeManager.getOwnership(),
      journal: (summary, note) => runtimeManager.noteRecap(summary, note, "lore"),
    });
  });
  runtimeDisposers.push(() => { scanGatingDisposed = true; scanGating?.dispose(); scanGating = null; });
  let loreAwaitsMessage = false;
  let loreAwaitsIntercept = false;
  const selectLore = (trigger: "MESSAGE_SENT" | "GENERATION_STARTED") => lore.select(trigger)
    .then((selection) => { if (selection) loreWatch.forced(selection.picks); })
    .catch((error) => console.warn("[Story Orchestrator] lore-select failed", error));
  const onLoreGenerationStarted = async (type: string | undefined, params: Record<string, unknown> | undefined, dryRun: boolean | undefined) => {
    loreAwaitsMessage = false;
    if (dryRun || type === "quiet" || params?.quiet_prompt) return;
    loreAwaitsIntercept = false;
    if (!lore.active()) return;
    if (willAddUserMessage(type, params, dryRun)) loreAwaitsMessage = true;
    else loreAwaitsIntercept = true;
  };
  const onLoreIntercept = async (type: string, aborted: boolean) => {
    if (type === "quiet" || !loreAwaitsIntercept) return;
    loreAwaitsIntercept = false;
    if (!aborted) await selectLore("GENERATION_STARTED");
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
    callDirector: (prompt, signal) => callExtractionModel(prompt, {
      profileId: runtimeManager.getExtractionSettings().profileId, role: "director",
      maxTokens: DIRECTOR_MAX_TOKENS,
      signal,
      debugResponse: globalThis.storyOrchestratorDebugDirectorResponse ?? null,
    }),
    breakerOpen: () => scheduler?.breakerOpen(routedProfileId("director")) ?? false,
    triggerMember: async (name) => { await executeSlashCommands(`/trigger await=true ${quoteSlashArg(name)}`, { silent: false }); },
    recordDecision: (audit) => runtimeManager.recordTalkDecision(audit),
    judgeDirector: (input) => judgeRuntime.director(input),
    getPlayerName,
    ownership: runtimeManager.getOwnership(),
  };
  talkController = new TalkController(talkHost);
  globalThis.talkControlInterceptor = async (_chat, contextSize, abort, type) => {
    promptCost.noteGenerationBudget(contextSize);
    let aborted = false;
    await talkController?.intercept((immediate) => { aborted = true; abort(immediate); }, type);
    await onLoreIntercept(type, aborted);
  };
  const generation = new GenerationLifecycle(isTurnMessageType);
  runtimeDisposers.push(generationWatch.attach(() => generation.snapshot().openedCount));
  runtimeDisposers.push(roleHealth.attach({ settings: () => runtimeManager.getExtractionSettings(), exists: profileExists, health: (id) => scheduler?.profileHealth(id) ?? null, notify: () => runtimeManager.notify() }));
  runtimeDisposers.push(promptCost.attach({ count: countTokens, budget: readPromptBudget, notify: () => runtimeManager.notify(), busy: () => generation.snapshot().outermost !== null }));
  runtimeDisposers.push(runtimeManager.subscribe(() => {
    const blocks = readExtensionPromptBlocks();
    promptCost.request([...blocks.own, ...blocks.foreign].map((block) => block.value));
  }));
  const applyGeneration = (intents: GenerationIntent[]) => {
    for (const intent of intents) {
      if (intent.kind === "opened") {
        loreWatch.opened(intent.type);
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
        loreWatch.settled(intent.rendered);
      }
    }
  };
  const privateInjectionEntries: HostSubscriptionEntry[] = [
    { eventName: "GROUP_MEMBER_DRAFTED", handler: (characterId) => { generation.drafted(characterId); runtimeManager.onMemberDrafted(characterId as number | [number]); } },
    { eventName: "GENERATION_STARTED", handler: async (...args: unknown[]) => { loreWatch.reassert(); scanGating?.reassert(); applyGeneration(generation.started(args, chatLastId() + 1)); await onLoreGenerationStarted(typeof args[0] === "string" ? args[0] : undefined, args[1] as Record<string, unknown> | undefined, args[2] === true); } },
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
    { eventName: EXTENSION_SETTINGS_LOADED_EVENT, handler: () => { noteHostSettingsLoaded(); void startupLoad(); } },
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
    void startupLoad();
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
  globalThis.storyOrchestratorLoreEvidence = undefined;
  started = false;
}

export { runtimeManager };
export type { RuntimeManager } from "./runtimeManager";
