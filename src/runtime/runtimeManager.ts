import { appendJudgeCall, dropJudgeCallsAfter, type JudgeCallRecord, type SceneReadRecord } from "@judge/index";
import type { JudgeRuntime } from "./judge";
import { StoryEngine, type RollbackOutcome, type ApplyQueueEntry, type BoundaryContext, type BoundaryResult, type EngineState, type NormalizedStoryV2, type NormalizedTransition, type StoryV2, type TalkControl, type ValidationError } from "@engine/index";
import type { CopilotMessage, CopilotStage, DriverContext, ProposalResult, Suggestion } from "@copilot/index";
import type { ProvisioningEnvironment, ProvisioningOp, ProvisioningResult, WizardSessionState } from "@wizard/index";
import { type ExtraGateSource, type ParsedDelta, type ParsedFact, type ReadOwnership, type SharedReadAudit, type SharedReadWindow } from "@extraction/index";
import { clearAllMemoryInjection, type ArcEntry, type EpistemicEntry, type LedgerView, type MemoryEntry, type MemoryTier, type ParsedArcSignal, type ParsedEpistemicSignal, type ParsedLedgerSignal, type ParsedMemoryLine, type UncertainPair } from "@memory/index";
import type { CuratorOp, CuratorPassOutcome } from "@stagecraft/index";
import { clearStoryExtensionPrompt, getContext, readInjectedPromptBlocks, showTextPopup, type WIEntrySnapshot } from "@services/STAPI";
import { AwayRecapController, type AwayRecap } from "./awayRecap";
import type { NarrativeStatus, RollbackNotice, RollbackUnavailable } from "./narrative";
import { PACING_HINT_EXTENSION_KEY } from "@constants/defaults";
import { CopilotCoordinator } from "./coordinators/copilotCoordinator";
import { PacingCoordinator } from "./coordinators/pacingCoordinator";
import { ExpansionCoordinator } from "./coordinators/expansionCoordinator";
import { ExtractionCoordinator, type JudgedExtractionWork } from "./coordinators/extractionCoordinator";
import { MemoryCoordinator } from "./coordinators/memoryCoordinator";
import type { MemoryMirrorSummary } from "./memoryMirror";
import { StagecraftCoordinator } from "./coordinators/stagecraftCoordinator";
import { createCuratorFilter } from "./curatorFilter";
import { createContinuityCheck, establishedFacts } from "./continuity";
import { activeSpeakerId, enabledCharacterIds, namesForRosterId, rosterIdForName } from "./roster";
import { EffectsApplier } from "./effectsApplier";
import { applyGlobalSettings, createExtras, hydrateExtras, stripGlobalSettings, TALK_DECISION_LIMIT } from "./extras";
import { beginRun, type RunContext, type RunOwnership } from "./runToken";
import { RunOwner } from "./runOwner";
import { runRollback, type RollbackDeps } from "./rollback";
import { memoryActions, memoryDelegates } from "./memoryActions";
import { readEffectTarget, reconcileEffectLedger, restoreEffectTarget } from "./effectHost";
import { recordSaveEvidence, saveEvidenceDeps } from "./saveEvidenceHost";
import { hasUnsavedChanges, saveWasLost } from "./saveHealth";
import { getGlobalSettings, liftLegacyChatSettings, setGlobalSettings } from "./settingsStore";
import { buildPossibleTransitions } from "./snapshot";
import { buildRuntimeSnapshot } from "./snapshotBuilder";
import { applyStoryUpdate, type StoryUpdateDeps, type StoryUpdateOutcome } from "./storyUpdate";
import { parseQualityValue } from "./values";
import { SessionJournal, type JournalEvent } from "./journal";
import { evaluateRequirements } from "./requirements";
import { evictedStoryNotice, loadPersistedRuntime, savePersistedRuntime, setSelectedStoryId } from "./persistence";
import { importStoryJson, loadSelectedStory, releaseGatedWorldInfo, removeStory, restartStory, selectStory, type StorySelectionDeps } from "./storySelection";
import { listStoryRecords } from "./storyLibrary";
import { clearWizardSession, loadWizardSession, saveWizardSession } from "./wizardSessions";
import type { CopilotRuntimeSettings, PersistedStoryRuntime, ExtractionRuntimeSettings, ExtractionRuntimeState, LoadedStory, MemoryRuntimeSettings, PacingSettings, PayloadCapture, RuntimeExtras, RuntimeSnapshot, StagecraftRuntimeState, StagecraftSettings, StoryLibraryRecord, TalkDecisionAudit, TalkRuntimeState, UiRuntimeSettings } from "./types";

export class RuntimeManager {
  private engine = new StoryEngine();
  private loaded: LoadedStory | null = null;
  private extras: RuntimeExtras = createExtras();
  private judge: JudgeRuntime | null = null;
  private validationErrors: ValidationError[] = [];
  private status = "No story loaded";
  // v2.3 plan 03: which world this run belongs to. The rules live in RunOwner.
  private readonly owner = new RunOwner({
    openChatId: () => String(getContext().chatId ?? ""),
    storyId: () => this.loaded?.record.id ?? null,
    playedVersion: () => this.loaded?.record.version ?? null,
  });
  /** v2.3 plan 03: dropped queued work belongs to the world that just ended. See RunOwner. */
  onEpochChanged(listener: () => void) { return this.owner.onChanged(listener); }
  invalidateRuns() { this.awayRecap.dismissUnless(String(getContext().chatId ?? "")); this.owner.bump(); }
  private noteRecap(summary: string, detail: string) { this.journal.record("story", summary, this.journalContext(), detail); this.extras.journal = this.journal.getRecords(); }
  // v2.3 plan 06: every host effect is recorded before it runs, so the chat knows what it changed in
  // state it shares with other chats — and can put it back, or refuse to.
  private readonly effects: EffectsApplier;
  private readonly listeners = new Set<() => void>();
  private readonly boundaryListeners = new Set<(result: BoundaryResult) => void>();
  private readonly rollbackListeners = new Set<(messageId: number, window: SharedReadWindow) => void>();
  private readonly sceneBreakListeners = new Set<(audit: SharedReadAudit) => void>();
  private readonly arcResolvedListeners = new Set<(arcIds: string[]) => void>();
  private readonly awayRecap = new AwayRecapController((render) => showTextPopup(render, { okButton: "Continue" }), (summary, detail) => this.noteRecap(summary, detail));
  private readonly notices: { lastRollback: RollbackNotice | null; rollbackUnavailable: RollbackUnavailable | null } = { lastRollback: null, rollbackUnavailable: null };
  private readonly journal = new SessionJournal();
  private readonly memory: MemoryCoordinator = new MemoryCoordinator({
    getStory: () => this.loaded?.story ?? null,
    getState: () => (this.loaded ? this.engine.serialize() : null),
    getMemory: () => this.extras.memory,
    setMemory: (next) => { this.extras.memory = next; },
    getExtractionSettings: () => this.getExtractionSettings(),
    getFiredTransitions: () => this.getFiredTransitions(),
    getExpansionGateSources: () => this.getExpansionGateSources(),
    enqueueExtractorDeltas: (accepted, window) => this.enqueueExtractorDeltas(accepted, window),
    enqueueMechanical: (deltas) => this.engine.enqueue({ source: "mechanical", blackboardVersionSum: 0, deltas }),
    ownership: this.owner.ownership,
    judge: () => this.judge,
    getScene: () => this.extras.judge.scene,
    rereadWindow: (window, reason) => this.extraction.runNow(undefined, reason, window),
    unsaved: () => !this.saveLanded(),
    persist: () => this.persist(),
    notify: () => this.notify(),
  });
  /** v2.3 plan 05: the author's memory decisions, in one object (see memoryActions.ts). */
  readonly memoryActions = memoryActions(memoryDelegates(this.memory));
  private readonly expansion: ExpansionCoordinator = new ExpansionCoordinator({
    getStory: () => this.loaded?.story ?? null,
    getStoryRaw: () => this.loaded?.record.raw,
    getState: () => (this.loaded ? this.engine.serialize() : null),
    getExpansion: () => this.extras.expansion,
    getSettings: () => this.getExtractionSettings(),
    getCanon: () => this.memory.getCanon(),
    getFactTexts: () => this.memory.getFacts().map((fact) => fact.text),
    replaceStory: (story) => this.replaceStory(story),
    judge: () => this.judge,
    getSceneRead: () => this.extras.judge.scene,
    setStatus: (status) => { this.status = status; },
    persist: () => this.persist(),
    notify: () => this.notify(),
    ownership: this.owner.ownership,
  });
  private readonly extraction: ExtractionCoordinator = new ExtractionCoordinator({
    getStory: () => this.loaded?.story ?? null,
    getState: () => (this.loaded ? this.engine.serialize() : null),
    getExtraction: () => this.extras.extraction,
    getSettings: () => this.getExtractionSettings(),
    memory: this.memory,
    getFiredTransitions: () => this.getFiredTransitions(),
    getExpansionGateSources: () => this.getExpansionGateSources(),
    enqueueExtractorDeltas: (accepted, window) => this.enqueueExtractorDeltas(accepted, window),
    commitBoundary: () => this.commitBoundary(),
    fireSceneBreakReplies: (occurrence) => this.effects.fireNpcReplies(this.engine.activeCheckpoint, this.extras, "sceneBreak", occurrence),
    emitSceneBreak: (audit) => this.sceneBreakListeners.forEach((listener) => listener(audit)),
    emitArcsResolved: (arcs) => { if (this.loaded && arcs.length) this.arcResolvedListeners.forEach((listener) => listener(arcs.map((arc) => arc.id))); },
    setStatus: (status) => { this.status = status; },
    judge: () => this.judge,
    persist: () => this.persist(),
    notify: () => this.notify(),
    ownership: this.owner.ownership,
  });
  private readonly pacing: PacingCoordinator = new PacingCoordinator({
    getStory: () => this.loaded?.story ?? null,
    getState: () => (this.loaded ? this.engine.serialize() : null),
    getStateLog: () => this.engine.stateLog,
    getTensionTarget: () => this.engine.activeCheckpoint?.tension_target,
    getTension: () => this.extras.tension,
    setTension: (next) => { this.extras.tension = next; },
    getPacing: () => this.extras.pacing,
  });
  private lastStoryUpdate: StoryUpdateOutcome | null = null;
  private readonly storyUpdateDeps: StoryUpdateDeps = {
    getLoaded: () => this.loaded,
    getState: () => (this.loaded ? this.engine.serialize() : null),
    mergeStory: (raw, base) => this.expansion.mergedStoryOrBase(raw, base),
    swapStory: (loaded, state, reanchored) => this.swapStory(loaded, state, reanchored),
    restart: () => this.restartStory(true),
    ownership: this.owner.ownership,
    journal: (outcome) => {
      this.lastStoryUpdate = outcome;
      this.journal.record("story", `story updated v${outcome.fromVersion} → v${outcome.toVersion} (${outcome.classification}${outcome.choice ? `, ${outcome.choice}` : ""})`, this.journalContext(), outcome.reason);
      this.extras.journal = this.journal.getRecords();
    },
  };
  private readonly stagecraft: StagecraftCoordinator = new StagecraftCoordinator({
    getStory: () => this.loaded?.story ?? null,
    getState: () => (this.loaded ? this.engine.serialize() : null),
    getStagecraft: () => this.extras.stagecraft,
    setStagecraft: (next) => { this.extras.stagecraft = next; },
    getExtractionSettings: () => this.getExtractionSettings(),
    getCanon: () => this.memory.getCanon(),
    getOpenArcs: () => this.memory.getOpenArcs(),
    filterEntries: createCuratorFilter(() => this.judge),
    warden: {
      check: createContinuityCheck(() => this.judge),
      // v2.3 plan 05: the fact list travels as RECORDS, so a review card can cite the message a truth
      // was read from rather than asserting a sentence with no owner.
      facts: () => establishedFacts(this.extras.memory.entries, this.memory.getLedger(), this.memory.boundProvenance(), this.extras.memory.conflicts),
      nudgeActive: () => this.copilot.getActiveNudge() !== null,
    },
    journal: (summary, note) => { this.journal.record("stagecraft", summary, this.journalContext(), note); this.extras.journal = this.journal.getRecords(); },
    persist: () => this.persist(),
    notify: () => this.notify(),
    ownership: this.owner.ownership,
  });
  private readonly copilot: CopilotCoordinator = new CopilotCoordinator({
    getStory: () => this.loaded?.story ?? null,
    getState: () => (this.loaded ? this.engine.serialize() : null),
    getSettings: () => this.extras.copilot,
    getProfileId: () => this.getExtractionSettings().profileId,
    getCanon: () => this.memory.getCanon(),
    notify: () => this.notify(),
    ownership: this.owner.ownership,
    wizardSession: (key) => loadWizardSession(key),
    saveWizardSession: (session) => saveWizardSession(session),
  });

  constructor() {
    this.effects = new EffectsApplier(this.owner.ownership, { reads: { read: readEffectTarget }, restore: restoreEffectTarget, persist: () => this.persist(), unsaved: () => hasUnsavedChanges(this.extras.saveHealth), journal: (summary, note) => this.noteRecap(summary, note ?? "") });
  }

  subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }

  notify() {
    if (this.journal.observeStatus(this.status, this.journalContext())) this.extras.journal = this.journal.getRecords();
    this.listeners.forEach((listener) => listener());
  }

  private journalContext() { const state = this.loaded ? this.engine.serialize() : null; return { boundary: state?.boundary ?? 0, messageId: state?.lastMessageId ?? -1 }; }

  getSessionJournal(): JournalEvent[] {
    const { extraction, talk, judge } = this.extras;
    return this.journal.build({ boundaryLog: this.loaded ? this.engine.stateLog : [], audits: extraction.audits, reconciliationEvents: extraction.reconciliationEvents, talkDecisions: talk.decisions, judgeCalls: judge.calls });
  }
  async flagMoment(note = "") {
    this.journal.flag(note, this.journalContext());
    this.extras.journal = this.journal.getRecords();
    await this.persist();
    this.notify();
  }

  onBoundary(listener: (result: BoundaryResult) => void) { this.boundaryListeners.add(listener); return () => { this.boundaryListeners.delete(listener); }; }
  onRollback(listener: (messageId: number, window: SharedReadWindow) => void) { this.rollbackListeners.add(listener); return () => { this.rollbackListeners.delete(listener); }; }
  onSceneBreakConfirmed(listener: (audit: SharedReadAudit) => void) { this.sceneBreakListeners.add(listener); return () => { this.sceneBreakListeners.delete(listener); }; }
  onArcsResolvedConfirmed(listener: (arcIds: string[]) => void) { this.arcResolvedListeners.add(listener); return () => { this.arcResolvedListeners.delete(listener); }; }

  private readonly selectionDeps: StorySelectionDeps = {
    loadStory: (loaded, mode, persisted) => this.loadStory(loaded, mode, persisted ?? null),
    restoreEffects: async (scope) => { await this.effects.restoreFor(this.extras, scope); },
    clearStory: async (status) => {
      const previous = this.loaded?.story ?? null;
      this.loaded = null;
      this.invalidateRuns();
      await this.effects.restoreFor(this.extras, "exit");
      this.extras = createExtras();
      this.pacing.clearPending();
      clearStoryExtensionPrompt(PACING_HINT_EXTENSION_KEY);
      clearAllMemoryInjection();
      this.status = status;
      this.notify();
      await releaseGatedWorldInfo(this.effects, previous, null);
    },
    fail: (errors, status) => { this.validationErrors = errors; this.status = status; this.notify(); },
    setStatus: (status) => { this.status = status; this.notify(); },
    isLoaded: (id) => this.loaded?.record.id === id,
    loadedFallback: () => (this.loaded ? { ...this.loaded } : null),
  };

  async loadSelectedFromChat() { if (await loadSelectedStory(this.selectionDeps)) void this.showAwayRecap(); }

  async importStory(rawText: string) { return importStoryJson(this.selectionDeps, rawText); }
  async selectStory(idOrHash: string, _mode: "activate" | "hydrate" = "activate") { return selectStory(this.selectionDeps, idOrHash); }
  async restartStory(alreadyConfirmed = false): Promise<boolean> { return restartStory(this.selectionDeps, this.loaded?.record.id ?? null, alreadyConfirmed); }
  async removeStory(idOrHash: string): Promise<boolean> { return removeStory(this.selectionDeps, idOrHash); }

  async commitBoundary(at?: number) {
    if (!this.loaded) return null;
    const run = beginRun(this.owner.ownership);
    this.notices.lastRollback = null;
    this.refreshRequirements();
    this.expansion.revalidateInserted();
    const pendingBridges = this.memory.enqueueArcBridges();
    const result = this.engine.commitBoundary(this.getBoundaryContext(at));
    this.memory.markBridgesApplied(pendingBridges);
    if (result.effects) {
      await this.effects.applyCheckpoint(this.loaded.story, this.engine.activeCheckpoint, this.extras, this.getSnapshot(), "activate", this.engine.checkpointPath);
    } else if (this.extras.requirements.ready && this.extras.lastAppliedCheckpointId !== this.engine.activeCheckpoint.id) {
      await this.effects.applyCheckpoint(this.loaded.story, this.engine.activeCheckpoint, this.extras, this.getSnapshot(), "hydrate", this.engine.checkpointPath);
    }
    if (!run.stillOwns()) return null;
    await this.stagecraft.applyAccepted();
    if (!run.stillOwns()) return null;
    this.pacing.applyCommitted(result);
    this.expansion.revalidateInserted();
    this.pacing.clearPending();
    this.pacing.updateSteering();
    this.memory.updateInjection();
    await this.persist();
    if (!run.stillOwns()) return null;
    this.status = result.fired ? `Moved into ${this.engine.activeCheckpoint?.name ?? result.activeCheckpointId}` : `Following ${this.engine.activeCheckpoint?.name ?? "the story"}`;
    if (result.fired && this.owner.ownsOpenChat()) {
      await this.effects.announceTransition(this.engine.activeCheckpoint, this.extras);
      if (!run.stillOwns()) return null;
    }
    this.boundaryListeners.forEach((listener) => listener(result));
    this.notify();
    return result;
  }

  async activateCheckpoint(id: string) {
    if (!this.loaded) return false;
    this.refreshRequirements();
    this.engine.activateCheckpoint(id, this.getBoundaryContext());
    await this.effects.applyCheckpoint(this.loaded.story, this.engine.activeCheckpoint, this.extras, this.getSnapshot(), "activate", this.engine.checkpointPath);
    this.pacing.updateSteering();
    this.memory.updateInjection();
    await this.persist();
    this.status = `Now at ${this.engine.activeCheckpoint?.name ?? id}`;
    this.notify();
    return true;
  }

  async setQuality(key: string, valueText: string) {
    if (!this.loaded) return false;
    const quality = this.loaded.story.qualityByKey[key];
    if (!quality) return this.rejectQuality(`Unknown quality ${key}`);
    const value = parseQualityValue(quality.type, valueText);
    if (value === undefined) return this.rejectQuality(`Invalid ${quality.type} value for ${key}`);
    const entry: ApplyQueueEntry = {
      source: "mechanical",
      blackboardVersionSum: 0,
      deltas: [{ q: key, v: value, source: quality.source }],
    };
    this.engine.enqueue(entry);
    await this.commitBoundary();
    return true;
  }

  async fireAfterSpeak() {
    if (!this.loaded) return;
    const run = beginRun(this.owner.ownership);
    const speakerId = this.getActiveSpeakerId();
    await this.effects.fireNpcReplies(this.engine.activeCheckpoint, this.extras, "afterSpeak", undefined, speakerId ? namesForRosterId(this.loaded.story, speakerId) : []);
    if (!run.stillOwns()) return;
    await this.persist();
    if (!run.stillOwns()) return;
    this.notify();
  }

  // A read keyed to a message dies with it, even when the engine has nothing to roll back (2026-09-19).
  private async dropReadsAfter(messageId: number) {
    const before = this.extras.judge.scene;
    this.extras.judge = dropJudgeCallsAfter(this.extras.judge, messageId);
    if (before !== this.extras.judge.scene) { await this.persist(); this.notify(); }
  }

  private readonly rollbackDeps: RollbackDeps = {
    engine: this.engine,
    journal: this.journal,
    context: () => ({ ...this.getBoundaryContext(), journal: this.journalContext() }),
    memory: this.memory,
    stagecraft: this.stagecraft,
    pacing: this.pacing,
    revalidateExpansion: () => this.expansion.revalidateInserted(),
    extras: () => this.extras,
    refreshRequirements: () => this.refreshRequirements(),
    reapplyCheckpoint: async (messageId) => { await this.effects.restoreFor(this.extras, { since: messageId }); await this.effects.applyCheckpoint(this.loaded!.story, this.engine.activeCheckpoint, this.extras, this.getSnapshot(), "hydrate", this.engine.checkpointPath); },
    dropReadsAfter: async (messageId) => { await this.dropReadsAfter(messageId); },
    persist: () => this.persist(),
    notify: () => this.notify(),
    notices: this.notices,
    setStatus: (status) => { this.status = status; },
    onApplied: (messageId, window) => this.rollbackListeners.forEach((listener) => listener(messageId, window)),
  };

  async rollbackFromMessage(messageId: number): Promise<RollbackOutcome> {
    // A mutation's POSITION is recorded: an in-flight read whose window reaches it is invalidated,
    // a reply merely appended later is not. See `tokenMatches`.
    this.owner.noteMutation(messageId);
    if (!this.loaded) return { ok: true, result: "noop" };
    return runRollback(this.rollbackDeps, messageId);
  }

  getStory(): NormalizedStoryV2 | null { return this.loaded?.story ?? null; }
  // What this chat is actually playing, authored form — the Studio edits this, not the library's copy.
  getPlayedStoryRaw(): unknown { return this.loaded?.record.raw ?? null; }
  getEngineState(): EngineState | null { return this.loaded ? this.engine.serialize() : null; }
  getExtractionSettings(): ExtractionRuntimeSettings { return this.extras.extraction.settings; }

  // v2.3 plan 06: rows the process died mid-write on are decided against what the host holds now.
  private reconcileEffectLedger() {
    const { rows, notes } = reconcileEffectLedger(this.extras.effects.ledger);
    this.extras.effects.ledger = rows;
    notes.forEach((note) => this.noteRecap(note, ""));
  }

  setExtractionSettings(settings: Partial<ExtractionRuntimeSettings>) {
    setGlobalSettings({ extraction: settings });
    this.refreshSettingsView();
  }

  getActiveTalkControl(): TalkControl | null {
    if (!this.loaded || !this.extras.requirements.ready || !this.extras.talk.enabled) return null;
    return this.engine.activeCheckpoint?.talk_control ?? null;
  }

  getTalkState(): TalkRuntimeState { return this.extras.talk; }

  setTalkDirectionEnabled(enabled: boolean, scope: "chat" | "global" = "chat") {
    if (scope === "global") setGlobalSettings({ talk: { enabled } });
    this.extras.talk = { ...this.extras.talk, enabled };
    void this.persist();
    this.notify();
  }

  recordJudgeCall(record: JudgeCallRecord) { this.extras.judge = appendJudgeCall(this.extras.judge, record); }
  getSceneRead(): SceneReadRecord | null { return this.extras.judge.scene; }
  recordSceneRead(read: SceneReadRecord | null) { this.extras.judge = { ...this.extras.judge, scene: read }; this.notify(); }

  recordTalkDecision(audit: TalkDecisionAudit) {
    this.extras.talk = { ...this.extras.talk, decisions: [...this.extras.talk.decisions, audit].slice(-TALK_DECISION_LIMIT) };
    void this.persist();
    this.notify();
  }

  getActiveCheckpointInfo(): { id: string; name: string; objective: string; storyTitle: string } | null {
    if (!this.loaded) return null;
    const checkpoint = this.engine.activeCheckpoint;
    return checkpoint ? { id: checkpoint.id, name: checkpoint.name, objective: checkpoint.objective, storyTitle: this.loaded.story.title } : null;
  }

  setPacingSettings(settings: Partial<PacingSettings>) {
    const { shapeOverride, ...global } = settings;
    if (Object.keys(global).length) setGlobalSettings({ pacing: global });
    if ("shapeOverride" in settings) this.extras.pacing = { ...this.extras.pacing, shapeOverride: shapeOverride ?? null };
    this.refreshSettingsView(() => this.pacing.updateSteering());
  }

  setMemorySettings(settings: Partial<MemoryRuntimeSettings>) {
    setGlobalSettings({ memory: settings });
    this.refreshSettingsView(() => this.memory.updateInjection());
  }

  getCopilotSettings(): CopilotRuntimeSettings { return this.extras.copilot; }

  setCopilotSettings(settings: Partial<CopilotRuntimeSettings>) {
    setGlobalSettings({ copilot: settings });
    this.refreshSettingsView(() => { if (!getGlobalSettings().copilot.enabled) this.clearCopilotNudge(); });
  }

  getUiSettings(): UiRuntimeSettings { return this.extras.ui; }

  setUiSettings(settings: Partial<UiRuntimeSettings>) {
    const { authorView, ...display } = settings;
    if (Object.keys(display).length) setGlobalSettings({ display });
    if (authorView !== undefined) this.extras.ui = { ...this.extras.ui, authorView };
    this.refreshSettingsView();
  }

  getGlobalSettings() { return getGlobalSettings(); }

  // Global settings changed: re-derive the in-memory view every reader uses, persist the per-chat part only.
  private refreshSettingsView(after?: () => void) {
    applyGlobalSettings(this.extras);
    after?.();
    void this.persist();
    this.notify();
  }

  async runCopilotStage(input: { draft: StoryV2; stage: CopilotStage; message: string; history: CopilotMessage[]; environment?: ProvisioningEnvironment }, debugResponse?: string): Promise<ProposalResult> { return this.copilot.runStage(input, debugResponse); }
  getProvisioningEnvironment(draft?: StoryV2): ProvisioningEnvironment { return this.copilot.getProvisioningEnvironment(draft); }
  async applyProvisioning(op: ProvisioningOp, draft?: StoryV2): Promise<ProvisioningResult> { return this.copilot.applyProvisioning(op, draft); }
  async readProvisioningEntry(lorebook: string, comment: string): Promise<WIEntrySnapshot | null> { return this.copilot.readProvisioningEntry(lorebook, comment); }
  getWizardSession(key: string): WizardSessionState | null { return loadWizardSession(key); }
  saveWizardSession(session: WizardSessionState) { saveWizardSession(session); }
  clearWizardSession(key: string) { clearWizardSession(key); }
  getDriverContext(): DriverContext | null { return this.copilot.getDriverContext(); }
  async runCopilotSuggest(debugResponse?: string): Promise<Suggestion[]> { return this.copilot.runSuggest(debugResponse); }
  async runCopilotReport(debugResponse?: string): Promise<string> { return this.copilot.runReport(debugResponse); }
  setCopilotNudge(text: string, depth = 1) { this.copilot.setNudge(text, depth); }
  clearCopilotNudge() { this.copilot.clearNudge(); }
  getActiveNudge(): string | null { return this.copilot.getActiveNudge(); }
  getExtractionFacts(): ParsedFact[] { return this.memory.getFacts(); }
  getFiredTransitions(): NormalizedTransition[] { return this.engine.stateLog.map((entry) => entry.fired).filter((transition): transition is NormalizedTransition => Boolean(transition)); }
  getExpansionGateSources(): ExtraGateSource[] { return this.expansion.getGateSources(); }
  recordReconciliation(descriptor: { checkpointId: string; boundary: number; targetedKeys: string[] }) { this.extraction.recordReconciliation(descriptor); }
  judgedExtraction(work: JudgedExtractionWork): boolean { return this.extraction.judged(work); }

  setSchedulerSnapshot(snapshot: ExtractionRuntimeState["scheduler"]) { this.extraction.setSchedulerSnapshot(snapshot); this.expansion.setSchedulerSnapshot(snapshot); void this.persist(); this.notify(); }

  pauseExtraction(message: string) {
    setGlobalSettings({ extraction: { enabled: false } });
    applyGlobalSettings(this.extras);
    this.extraction.pause(message);
    this.status = "Story tracking paused";
    void this.persist();
    this.notify();
  }

  private enqueueExtractorDeltas(acceptedDeltas: ParsedDelta[], window: { from: number; to: number }) {
    if (!acceptedDeltas.length) return;
    const tensionLevels = this.pacing.applyExtractorTension(acceptedDeltas);
    const versions = this.engine.serialize().blackboard.versions;
    this.engine.enqueue({ source: "extractor", blackboardVersionSum: Object.values(versions).reduce((sum, version) => sum + version, 0), turnRange: window, deltas: acceptedDeltas.map((entry) => entry.delta), ...(tensionLevels.length ? { tensionLevels } : {}) });
  }

  async applyExtractionAudit(audit: SharedReadAudit, facts: ParsedFact[], memoryLines: ParsedMemoryLine[] = [], arcSignals: ParsedArcSignal[] = [], epistemicSignals: ParsedEpistemicSignal[] = [], ledgerSignals: ParsedLedgerSignal[] = [], read: ReadOwnership | null = null) { await this.extraction.applyAudit(audit, facts, memoryLines, arcSignals, epistemicSignals, ledgerSignals, read); }

  async runArcSummaryPass(arcIds: string[]): Promise<boolean> { return this.memory.runArcSummaryPass(arcIds); }
  detectSceneBreak() { return this.extraction.detectSceneBreak(); }
  async runSceneBreakPass(audit: SharedReadAudit) { await this.extraction.runSceneBreakPass(audit); }
  shouldCompactShortTerm(lastMessageId: number): boolean { return this.extraction.shouldCompactShortTerm(lastMessageId); }
  async runShortTermCompaction() { await this.extraction.runShortTermCompaction(); }
  async runEpistemicLedgerPass(audit: SharedReadAudit): Promise<boolean> { return this.extraction.runEpistemicLedgerPass(audit); }
  async runExtractionNow(debugResponse?: string, reason = "manual") { return this.extraction.runNow(debugResponse, reason); }
  async runMemorizeBacklog(windowSize = 8): Promise<boolean> { return this.extraction.runMemorizeBacklog(windowSize); }
  async setMemoryPinned(id: string, pinned: boolean) { await this.memory.setMemoryPinned(id, pinned); }
  async excludeMemoryEntry(id: string) { await this.memory.excludeMemoryEntry(id); }
  async restoreMemoryEntry(entry: MemoryEntry) { await this.memory.restoreMemoryEntry(entry); }
  async editMemoryEntry(id: string, text: string) { await this.memory.editMemoryEntry(id, text); }
  async storeDroppedMemory(id: string) { return this.memory.storeDroppedEntry(id); }
  attachJudge(judge: JudgeRuntime) { this.judge = judge; }
  // v2.3 plan 09: the next-turn preview's controls. The scene coordinator lives in runtime/index.ts.
  private sceneRunner: { rerun(): Promise<unknown> } | null = null;
  attachScene(scene: { rerun(): Promise<unknown> } | null) { this.sceneRunner = scene; }
  readonly previewActions = { clearNote: () => this.stagecraft.clearContinuityNote(), rerunScene: async () => { await this.sceneRunner?.rerun(); } };
  getArcs(): ArcEntry[] { return this.memory.getArcs(); }
  getOpenArcs(): string[] { return this.memory.getOpenArcs(); }
  getEpistemicLedgerCapable(): boolean { return this.memory.capable; }
  getEntities(): string[] { return this.memory.getEntities(); }
  async setArcPinned(id: string, pinned: boolean) { await this.memory.setArcPinned(id, pinned); }
  async removeArc(id: string) { await this.memory.removeArc(id); }
  getCanon(): string { return this.memory.getCanon(); }
  getPossibleTransitions(): string[] { return buildPossibleTransitions(this.loaded?.story ?? null, this.loaded ? this.engine.serialize() : null); }
  private rejectQuality(reason: string): false { this.status = reason; this.notify(); return false; }
  async regenerateCanon(force = false): Promise<boolean> { return this.memory.regenerateCanon(force); }
  scheduleExpansionForActive(schedule: (reason: string, run: () => Promise<void>) => void) { return this.expansion.scheduleForActive(schedule); }
  async runExpansionNow(debugResponse?: string) { return this.expansion.runNow(debugResponse); }
  /** v2.3 plan 07: the boundary promotion and the author's regenerate, in one surface. */
  readonly expansions = { commitValidated: () => this.expansion.commitValidated(), regenerate: (key: string) => this.expansion.regenerate(key) };

  /**
   * v2.3 plan 03: the identity in-flight work is checked against, for writers constructed outside
   * the manager. Exposed so a live gate can assert ownership without guessing — `so-state current`
   * reports it, and the switch-mid-read scenario needs to see the epoch move. Read-only: nothing
   * outside may set it.
   */
  getOwnership(): RunOwnership { return this.owner.ownership; }

  getRunContext(): RunContext { return this.owner.context(); }

  getSnapshot(): RuntimeSnapshot {
    return buildRuntimeSnapshot({
      loaded: this.loaded,
      state: this.loaded ? this.engine.serialize() : null,
      extras: this.extras,
      validationErrors: this.validationErrors,
      status: this.status,
      pendingWrites: this.loaded ? this.engine.pendingWrites : [],
      boundaryLog: this.loaded ? this.engine.stateLog : [],
      expectedTension: this.loaded ? this.pacing.expectedTension() : null,
      openThreads: this.memory.getOpenArcs(),
      canon: this.memory.getCanonProse(),
      ...this.notices,
      ledger: this.memory.getLedger(),
      driver: this.copilot.getDriverContext(),
      activeNudge: this.copilot.getActiveNudge(),
      payloadCaptures: this.journal.getCaptures(),
    // A live in-memory read of ST's own extension prompts: cheap, and the only honest answer to
    // "what will the next reply carry" (a capture answers what the LAST one carried).
    injectedBlocks: readInjectedPromptBlocks(),
    });
  }

  capturePayload(reason = "generation") {
    if (!this.loaded) return;
    const capture: PayloadCapture = { at: new Date().toISOString(), boundary: this.engine.serialize().boundary, reason, blocks: readInjectedPromptBlocks() };
    if (this.journal.capture(capture)) this.notify();
  }

  getPayloadCaptures(): PayloadCapture[] { return this.journal.getCaptures(); }

  private async loadStory(loaded: LoadedStory, mode: "activate" | "hydrate", knownPersisted: PersistedStoryRuntime | null = null) {
    const previous = this.loaded?.story ?? null;
    this.validationErrors = [];
    this.pacing.clearPending();
    const persisted = mode === "hydrate" ? knownPersisted ?? loadPersistedRuntime(loaded.record.id) : null;
    const priorSessionAt = persisted?.extras?.lastSessionAt ?? null;
    liftLegacyChatSettings(persisted?.extras, String(getContext().chatId ?? "an earlier chat"));
    this.invalidateRuns();
    this.extras = hydrateExtras(persisted?.extras);
    this.journal.hydrate(this.extras.journal);
    this.reconcileEffectLedger();
    this.loaded = { record: loaded.record, story: this.expansion.mergedStoryOrBase(loaded.record.raw, loaded.story) };
    // Minted *after* the load names its world: a token taken before it describes the world being replaced.
    const run = beginRun(this.owner.ownership);
    this.engine.loadStory(this.loaded.story);
    this.refreshRequirements();
    // The history travels WITH the state: `hydrate` clears the log before restoring what it is handed.
    const saved = mode === "hydrate" ? persisted?.engineState ?? null : null;
    if (saved) this.engine.hydrate(saved, persisted?.engineHistory ?? null);
    await this.effects.applyCheckpoint(loaded.story, this.engine.activeCheckpoint, this.extras, this.getSnapshot(), saved ? "hydrate" : "activate", this.engine.checkpointPath);
    this.status = `${saved ? "Continuing" : "Started"} ${loaded.story.title}${this.engine.hydrateRepair ? ` — ${this.engine.hydrateRepair}` : ""}`;
    await releaseGatedWorldInfo(this.effects, previous, loaded.story);
    this.pacing.updateSteering();
    this.memory.updateInjection();
    // Only the current load may queue a recap: it awaits, and S3 is the popup a superseded one left.
    if (run.stillOwns()) this.awayRecap.detect(priorSessionAt, this.getSnapshot().narrative, String(getContext().chatId ?? ""));
    else this.noteRecap("away recap skipped", `a later world change superseded this load: ${run.lapsedDetail() ?? "no detail"}`);
    setSelectedStoryId(loaded.record.id);
    await this.persist();
    this.notify();
  }

  getNarrativeStatus(): NarrativeStatus { return this.getSnapshot().narrative; }
  getAwayRecap(): AwayRecap | null { return this.awayRecap.get(); }
  async showAwayRecap(): Promise<boolean> { return this.awayRecap.show(); }

  private async persist() {
    if (!this.loaded) return;
    // v2.3 plan 03. The chokepoint: every coordinator save() ends here, and `saveMetadata` writes into
    // whichever chat ST has open at this instant, so a runtime hydrated for another chat declines
    // rather than guessing. v2.1 plan 08 is the recorded case: a new group chat inherited the run.
    if (!this.owner.ownsOpenChat()) {
      this.journal.record("story", "save skipped: this run belongs to another chat", this.journalContext(), `claimed ${this.owner.claimedChat()}, open chat is ${String(getContext().chatId ?? "")}`);
      this.extras.journal = this.journal.getRecords();
      return;
    }
    this.extras.lastSessionAt = new Date().toISOString();
    const loaded = this.loaded;
    // v2.3 plan 05. Losing a story's state is a fact about this chat, not a later surprise.
    const evicted = savePersistedRuntime({ storyId: loaded.record.id, storyTitle: loaded.story.title, pinnedStory: loaded.record.raw, playedVersion: loaded.record.version, contentHashAtLoad: loaded.record.hash, engineState: this.engine.serialize(), engineHistory: this.engine.serializeHistory(), extras: stripGlobalSettings(this.extras) });
    const notice = evictedStoryNotice(evicted, (id) => listStoryRecords().find((record) => record.id === id)?.title ?? null);
    if (notice) this.noteRecap(notice.summary, notice.detail);
    await this.saveAndObserve();
  }

  // v2.3 plan 06: `saveMetadata` swallows its own errors, so the write is OBSERVED (saveEvidence).
  private async saveAndObserve() {
    const deps = saveEvidenceDeps(() => this.extras.saveHealth, (health) => { this.extras.saveHealth = health; }, (summary, note) => this.journal.record("story", summary, this.journalContext(), note));
    // Armed first, write second: the watcher has to be listening before the request goes out.
    const observed = recordSaveEvidence(deps, this.engine.serialize().boundary);
    await Promise.all([Promise.resolve(getContext().saveMetadata?.()), observed]);
  }

  /** v2.3 plan 05. "Did the write reach the chat's stored state": `persist` cannot answer it, because
   *  `saveMetadata` catches its own errors and it returns early rather than throwing — and a save that
   *  never went out (no story, another chat's runtime) is not a landed one either (memoryQueue). */
  private saveLanded(): boolean { return Boolean(this.loaded) && this.owner.ownsOpenChat() && !saveWasLost(this.extras.saveHealth); }

  // The author edited this story from this chat: take the saved version without losing the run.
  // Every other chat keeps its pinned copy (spec addendum §Story identity).
  async applyStoryUpdate(record?: StoryLibraryRecord): Promise<StoryUpdateOutcome> { return applyStoryUpdate(this.storyUpdateDeps, record); }
  getLastStoryUpdate(): StoryUpdateOutcome | null { return this.lastStoryUpdate; }

  private async swapStory(loaded: LoadedStory, state: EngineState | null, reanchored: boolean) {
    const previous = this.loaded?.story ?? null;
    this.loaded = loaded;
    this.engine.loadStory(loaded.story);
    if (state) this.engine.hydrate(state);
    this.refreshRequirements();
    this.expansion.revalidateInserted();
    await this.effects.applyCheckpoint(loaded.story, this.engine.activeCheckpoint, this.extras, this.getSnapshot(), reanchored ? "activate" : "hydrate", this.engine.checkpointPath);
    await releaseGatedWorldInfo(this.effects, previous, loaded.story);
    this.pacing.replayCommitted();
    this.pacing.updateSteering();
    this.memory.updateInjection();
    setSelectedStoryId(loaded.record.id);
    await this.persist();
    this.status = reanchored ? `Now at ${this.engine.activeCheckpoint?.name ?? loaded.story.startCheckpointId}` : `Following ${this.engine.activeCheckpoint?.name ?? "the story"}`;
    this.notify();
  }

  // Merged expansions change the played graph under a live engine: reload, then restore the
  // serialized state so boundary counters and the blackboard survive the swap.
  private replaceStory(story: NormalizedStoryV2) {
    if (!this.loaded) return;
    const state = this.engine.serialize();
    this.loaded = { ...this.loaded, story };
    this.engine.loadStory(story);
    this.engine.hydrate(state);
  }

  getEnabledCharacterIds(): string[] { return enabledCharacterIds(this.loaded?.story ?? null); }

  getActiveSpeakerId(): string | null { return activeSpeakerId(this.loaded?.story ?? null); }

  rosterIdForName(name: string): string | null { return rosterIdForName(this.loaded?.story ?? null, name); }

  onMemberDrafted(chId: number | [number]) { this.memory.onMemberDrafted(chId); }
  onGenerationStarted(type: unknown, dryRun?: unknown) { if (type === "impersonate" || type === "quiet") this.memory.withholdPrivateKnowledge(); this.stagecraft.onGenerationStarted(type, dryRun); }
  onGenerationEnded() { this.clearPrivateInjection(); this.clearCopilotNudge(); this.stagecraft.clearContinuityNote(); }
  runWardenPass(replyMessageId: number) { return this.stagecraft.runWardenPass(replyMessageId); }

  clearPrivateInjection() { if (!this.loaded) return; this.memory.updateInjection(); }

  getEpistemic(): EpistemicEntry[] { return this.memory.getEpistemic(); }
  getLedger(): LedgerView[] { return this.memory.getLedger(); }
  getEpistemicBlock(): string { return this.memory.getEpistemicBlock(); }
  getAppliedEpistemicBlock(): string { return this.memory.getAppliedEpistemicBlock(); }
  getLedgerBlock(): string { return this.memory.getLedgerBlock(); }

  setEpistemicLedgerCapable(capable: boolean) { this.setMemorySettings({ epistemicLedgerCapable: capable }); }

  async setEpistemicPinned(id: string, pinned: boolean) { await this.memory.setEpistemicPinned(id, pinned); }
  async removeEpistemicEntry(id: string) { await this.memory.removeEpistemicEntry(id); }
  async setLedgerPinned(id: string, pinned: boolean) { await this.memory.setLedgerPinned(id, pinned); }
  async removeLedgerEntry(id: string) { await this.memory.removeLedgerEntry(id); }
  getMemoryInjectionBlocks(): Record<MemoryTier, string> { return this.memory.getInjectionBlocks(); }

  async runConsolidation(): Promise<{ dropped: number; superseded: number; confirmed: number; uncertain: UncertainPair[] }> { return this.memory.runConsolidation(); }

  async runSupersessionBridge(supersedingEntries: MemoryEntry[]): Promise<boolean> { return this.memory.runSupersessionBridge(supersedingEntries); }

  async syncWorldInfo(): Promise<MemoryMirrorSummary> { return this.memory.syncWorldInfo(); }

  getStagecraftState(): StagecraftRuntimeState { return this.stagecraft.getState(); }
  setStagecraftSettings(settings: Partial<StagecraftSettings>) { setGlobalSettings({ stagecraft: settings }); this.refreshSettingsView(); }
  curatorDueForRun(): boolean { return this.stagecraft.dueForRun(); }
  async runWiCuratorPass(reason?: string, debugResponse?: string): Promise<CuratorPassOutcome> { return this.stagecraft.runCuratorPass(reason, debugResponse); }
  async setCuratorOpDecision(id: string, index: number, status: "accepted" | "rejected", op?: CuratorOp) { await this.stagecraft.setOpDecision(id, index, status, op); }
  async decideCuratorProposal(id: string, status: "accepted" | "rejected") { await this.stagecraft.decideProposal(id, status); }
  async applyCuratorProposals(): Promise<number> { return this.stagecraft.applyAccepted(); }

  private getBoundaryContext(at?: number): BoundaryContext { const chat = Array.isArray(getContext().chat) ? getContext().chat : []; const last = at === undefined ? chat.length - 1 : Math.min(at, chat.length - 1); return { lastMessageId: last, chatLength: last + 1 }; }

  private refreshRequirements() {
    this.extras.requirements = evaluateRequirements(this.loaded?.story ?? null);
    this.extras.updatedAt = new Date().toISOString();
  }
}
export const runtimeManager = new RuntimeManager();
