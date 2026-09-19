import { StoryEngine, type ApplyQueueEntry, type BoundaryContext, type BoundaryResult, type EngineState, type NormalizedStoryV2, type NormalizedTransition, type StoryV2, type TalkControl, type ValidationError } from "@engine/index";
import type { CopilotMessage, CopilotStage, DriverContext, ProposalResult, Suggestion } from "@copilot/index";
import type { ProvisioningEnvironment, ProvisioningOp, ProvisioningResult, WizardSessionState } from "@wizard/index";
import { getChatWindow, type ExtraGateSource, type ParsedDelta, type ParsedFact, type SharedReadAudit, type SharedReadWindow } from "@extraction/index";
import { clearAllMemoryInjection, type ArcEntry, type EpistemicEntry, type LedgerView, type MemoryEntry, type MemoryTier, type ParsedArcSignal, type ParsedEpistemicSignal, type ParsedLedgerSignal, type ParsedMemoryLine, type UncertainPair } from "@memory/index";
import type { CuratorOp, CuratorPassOutcome } from "@stagecraft/index";
import { clearStoryExtensionPrompt, getContext, readInjectedPromptBlocks, showTextPopup } from "@services/STAPI";
import { AwayRecapController, type AwayRecap } from "./awayRecap";
import type { NarrativeStatus, RollbackNotice } from "./narrative";
import { PACING_HINT_EXTENSION_KEY } from "@constants/defaults";
import { CopilotCoordinator } from "./coordinators/copilotCoordinator";
import { PacingCoordinator } from "./coordinators/pacingCoordinator";
import { ExpansionCoordinator } from "./coordinators/expansionCoordinator";
import { ExtractionCoordinator } from "./coordinators/extractionCoordinator";
import { MemoryCoordinator } from "./coordinators/memoryCoordinator";
import type { MemoryMirrorSummary } from "./memoryMirror";
import { StagecraftCoordinator } from "./coordinators/stagecraftCoordinator";
import { activeSpeakerId, enabledCharacterIds, namesForRosterId, rosterIdForName } from "./roster";
import { EffectsApplier } from "./effectsApplier";
import { applyGlobalSettings, createExtras, hydrateExtras, stripGlobalSettings, TALK_DECISION_LIMIT } from "./extras";
import { getGlobalSettings, liftLegacyChatSettings, setGlobalSettings } from "./settingsStore";
import { buildPossibleTransitions } from "./snapshot";
import { buildRuntimeSnapshot } from "./snapshotBuilder";
import { applyStoryUpdate, type StoryUpdateDeps, type StoryUpdateOutcome } from "./storyUpdate";
import { parseQualityValue } from "./values";
import { SessionJournal, type JournalEvent } from "./journal";
import { evaluateRequirements } from "./requirements";
import { loadPersistedRuntime, savePersistedRuntime, setSelectedStoryId } from "./persistence";
import { importStoryJson, loadSelectedStory, removeStory, restartStory, selectStory, type StorySelectionDeps } from "./storySelection";
import { clearWizardSession, loadWizardSession, saveWizardSession } from "./wizardSessions";
import type { CopilotRuntimeSettings, PersistedStoryRuntime, ExtractionRuntimeSettings, ExtractionRuntimeState, LoadedStory, MemoryRuntimeSettings, PacingSettings, PayloadCapture, RuntimeExtras, RuntimeSnapshot, StagecraftRuntimeState, StagecraftSettings, StoryLibraryRecord, TalkDecisionAudit, TalkRuntimeState, UiRuntimeSettings } from "./types";

export class RuntimeManager {
  private engine = new StoryEngine();
  private loaded: LoadedStory | null = null;
  private extras: RuntimeExtras = createExtras();
  private validationErrors: ValidationError[] = [];
  private status = "No story loaded";
  private readonly effects = new EffectsApplier();
  private readonly listeners = new Set<() => void>();
  private readonly boundaryListeners = new Set<(result: BoundaryResult) => void>();
  private readonly rollbackListeners = new Set<(messageId: number, window: SharedReadWindow) => void>();
  private readonly sceneBreakListeners = new Set<(audit: SharedReadAudit) => void>();
  private readonly arcResolvedListeners = new Set<(arcIds: string[]) => void>();
  private readonly awayRecap = new AwayRecapController((html) => showTextPopup(html, { okButton: "Continue" }));
  private lastRollback: RollbackNotice | null = null;
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
    persist: () => this.persist(),
    notify: () => this.notify(),
  });
  private readonly expansion: ExpansionCoordinator = new ExpansionCoordinator({
    getStory: () => this.loaded?.story ?? null,
    getStoryRaw: () => this.loaded?.record.raw,
    getState: () => (this.loaded ? this.engine.serialize() : null),
    getExpansion: () => this.extras.expansion,
    getSettings: () => this.getExtractionSettings(),
    getCanon: () => this.memory.getCanon(),
    getFactTexts: () => this.memory.getFacts().map((fact) => fact.text),
    replaceStory: (story) => this.replaceStory(story),
    setStatus: (status) => { this.status = status; },
    persist: () => this.persist(),
    notify: () => this.notify(),
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
    persist: () => this.persist(),
    notify: () => this.notify(),
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
    journal: (summary, note) => {
      this.journal.record("stagecraft", summary, this.journalContext(), note);
      this.extras.journal = this.journal.getRecords();
    },
    persist: () => this.persist(),
    notify: () => this.notify(),
  });
  private readonly copilot: CopilotCoordinator = new CopilotCoordinator({
    getStory: () => this.loaded?.story ?? null,
    getState: () => (this.loaded ? this.engine.serialize() : null),
    getSettings: () => this.extras.copilot,
    getProfileId: () => this.getExtractionSettings().profileId,
    getCanon: () => this.memory.getCanon(),
    notify: () => this.notify(),
  });

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  notify() {
    if (this.journal.observeStatus(this.status, this.journalContext())) this.extras.journal = this.journal.getRecords();
    this.listeners.forEach((listener) => listener());
  }

  private journalContext() {
    const state = this.loaded ? this.engine.serialize() : null;
    return { boundary: state?.boundary ?? 0, messageId: state?.lastMessageId ?? -1 };
  }

  getSessionJournal(): JournalEvent[] {
    return this.journal.build({
      boundaryLog: this.loaded ? this.engine.stateLog : [],
      audits: this.extras.extraction.audits,
      reconciliationEvents: this.extras.extraction.reconciliationEvents,
      talkDecisions: this.extras.talk.decisions,
    });
  }

  async flagMoment(note = "") {
    this.journal.flag(note, this.journalContext());
    this.extras.journal = this.journal.getRecords();
    await this.persist();
    this.notify();
  }

  onBoundary(listener: (result: BoundaryResult) => void) {
    this.boundaryListeners.add(listener);
    return () => { this.boundaryListeners.delete(listener); };
  }

  onRollback(listener: (messageId: number, window: SharedReadWindow) => void) {
    this.rollbackListeners.add(listener);
    return () => { this.rollbackListeners.delete(listener); };
  }

  onSceneBreakConfirmed(listener: (audit: SharedReadAudit) => void) {
    this.sceneBreakListeners.add(listener);
    return () => { this.sceneBreakListeners.delete(listener); };
  }

  onArcsResolvedConfirmed(listener: (arcIds: string[]) => void) {
    this.arcResolvedListeners.add(listener);
    return () => { this.arcResolvedListeners.delete(listener); };
  }

  private readonly selectionDeps: StorySelectionDeps = {
    loadStory: (loaded, mode, persisted) => this.loadStory(loaded, mode, persisted ?? null),
    clearStory: (status) => {
      this.loaded = null;
      this.extras = createExtras();
      this.pacing.clearPending();
      clearStoryExtensionPrompt(PACING_HINT_EXTENSION_KEY);
      clearAllMemoryInjection();
      this.status = status;
      this.notify();
    },
    fail: (errors, status) => { this.validationErrors = errors; this.status = status; this.notify(); },
    setStatus: (status) => { this.status = status; this.notify(); },
    isLoaded: (id) => this.loaded?.record.id === id,
    loadedFallback: () => (this.loaded ? { ...this.loaded } : null),
  };

  async loadSelectedFromChat() {
    if (await loadSelectedStory(this.selectionDeps)) void this.showAwayRecap();
  }

  async importStory(rawText: string) { return importStoryJson(this.selectionDeps, rawText); }
  async selectStory(idOrHash: string, _mode: "activate" | "hydrate" = "activate") { return selectStory(this.selectionDeps, idOrHash); }
  async restartStory(alreadyConfirmed = false): Promise<boolean> { return restartStory(this.selectionDeps, this.loaded?.record.id ?? null, alreadyConfirmed); }
  async removeStory(idOrHash: string): Promise<boolean> { return removeStory(this.selectionDeps, idOrHash); }

  async commitBoundary() {
    if (!this.loaded) return null;
    this.lastRollback = null;
    this.refreshRequirements();
    this.expansion.revalidateInserted();
    const pendingBridges = this.memory.enqueueArcBridges();
    const result = this.engine.commitBoundary(this.getBoundaryContext());
    this.memory.markBridgesApplied(pendingBridges);
    if (result.effects) {
      await this.effects.applyCheckpoint(this.loaded.story, this.engine.activeCheckpoint, this.extras, this.getSnapshot(), "activate");
    } else if (this.extras.requirements.ready && this.extras.lastAppliedCheckpointId !== this.engine.activeCheckpoint.id) {
      await this.effects.applyCheckpoint(this.loaded.story, this.engine.activeCheckpoint, this.extras, this.getSnapshot(), "hydrate");
    }
    // Curator proposals the author (or auto mode) accepted are boundary-applied, exactly like the
    // checkpoint's own effects — never mid-turn (spec addendum §Stagecraft).
    await this.stagecraft.applyAccepted();
    this.pacing.applyCommitted(result);
    this.expansion.revalidateInserted();
    this.pacing.clearPending();
    this.pacing.updateSteering();
    this.memory.updateInjection();
    await this.persist();
    this.status = result.fired ? `Moved into ${this.engine.activeCheckpoint?.name ?? result.activeCheckpointId}` : `Following ${this.engine.activeCheckpoint?.name ?? "the story"}`;
    if (result.fired) await this.effects.announceTransition(this.engine.activeCheckpoint, this.extras);
    this.boundaryListeners.forEach((listener) => listener(result));
    this.notify();
    return result;
  }

  async activateCheckpoint(id: string) {
    if (!this.loaded) return false;
    this.refreshRequirements();
    this.engine.activateCheckpoint(id, this.getBoundaryContext());
    await this.effects.applyCheckpoint(this.loaded.story, this.engine.activeCheckpoint, this.extras, this.getSnapshot(), "activate");
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
    if (!quality) {
      this.status = `Unknown quality ${key}`;
      this.notify();
      return false;
    }
    const value = parseQualityValue(quality.type, valueText);
    if (value === undefined) {
      this.status = `Invalid ${quality.type} value for ${key}`;
      this.notify();
      return false;
    }
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
    const speakerId = this.getActiveSpeakerId();
    await this.effects.fireNpcReplies(this.engine.activeCheckpoint, this.extras, "afterSpeak", undefined, speakerId ? namesForRosterId(this.loaded.story, speakerId) : []);
    await this.persist();
    this.notify();
  }

  async rollbackFromMessage(messageId: number) {
    if (!this.loaded) return;
    if (!this.engine.shouldRollbackFromMessage(messageId)) return;
    const boundary = this.engine.boundaryBeforeMessage(messageId);
    const changed = this.engine.rollbackTo(boundary);
    if (changed) {
      const context = this.getBoundaryContext();
      const restored = this.engine.serialize();
      const window = getChatWindow(restored.checkpointStartedMessageId, context.lastMessageId);
      this.memory.rollbackFromMessage(messageId, boundary);
      await this.stagecraft.revertAppliedSince(messageId);
      this.extras.extraction.audits = this.extras.extraction.audits.filter((audit) => audit.window.to < messageId);
      this.pacing.replayCommitted();
      this.refreshRequirements();
      await this.effects.applyCheckpoint(this.loaded.story, this.engine.activeCheckpoint, this.extras, this.getSnapshot(), "hydrate");
      this.pacing.updateSteering();
      this.memory.updateInjection();
      await this.persist();
      this.lastRollback = { checkpointName: this.engine.activeCheckpoint?.name ?? "an earlier point", at: new Date().toISOString() };
      this.status = `Stepped back to ${this.engine.activeCheckpoint?.name ?? "an earlier point"}`;
      this.rollbackListeners.forEach((listener) => listener(messageId, window));
      this.notify();
    }
  }

  getStory(): NormalizedStoryV2 | null { return this.loaded?.story ?? null; }
  // What this chat is actually playing, authored form — the Studio edits this, not the library's
  // copy, when the two have drifted apart.
  getPlayedStoryRaw(): unknown { return this.loaded?.record.raw ?? null; }
  getEngineState(): EngineState | null { return this.loaded ? this.engine.serialize() : null; }
  getExtractionSettings(): ExtractionRuntimeSettings { return this.extras.extraction.settings; }

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

  // Global settings changed: re-derive the in-memory view every reader uses, then persist the
  // per-chat part only.
  private refreshSettingsView(after?: () => void) {
    applyGlobalSettings(this.extras);
    after?.();
    void this.persist();
    this.notify();
  }

  async runCopilotStage(input: { draft: StoryV2; stage: CopilotStage; message: string; history: CopilotMessage[]; environment?: ProvisioningEnvironment }, debugResponse?: string): Promise<ProposalResult> { return this.copilot.runStage(input, debugResponse); }
  getProvisioningEnvironment(draft?: StoryV2): ProvisioningEnvironment { return this.copilot.getProvisioningEnvironment(draft); }
  async applyProvisioning(op: ProvisioningOp, draft?: StoryV2): Promise<ProvisioningResult> { return this.copilot.applyProvisioning(op, draft); }
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

  setSchedulerSnapshot(snapshot: ExtractionRuntimeState["scheduler"]) {
    this.extraction.setSchedulerSnapshot(snapshot);
    this.expansion.setSchedulerSnapshot(snapshot);
    void this.persist();
    this.notify();
  }

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
    const versions = this.engine.serialize().blackboard.versions;
    const blackboardVersionSum = Object.values(versions).reduce((sum, version) => sum + version, 0);
    const tensionLevels = this.pacing.applyExtractorTension(acceptedDeltas);
    this.engine.enqueue({
      source: "extractor",
      blackboardVersionSum,
      turnRange: window,
      deltas: acceptedDeltas.map((entry) => entry.delta),
      ...(tensionLevels.length ? { tensionLevels } : {}),
    });
  }

  async applyExtractionAudit(audit: SharedReadAudit, facts: ParsedFact[], memoryLines: ParsedMemoryLine[] = [], arcSignals: ParsedArcSignal[] = [], epistemicSignals: ParsedEpistemicSignal[] = [], ledgerSignals: ParsedLedgerSignal[] = []) { await this.extraction.applyAudit(audit, facts, memoryLines, arcSignals, epistemicSignals, ledgerSignals); }

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
  getArcs(): ArcEntry[] { return this.memory.getArcs(); }
  getOpenArcs(): string[] { return this.memory.getOpenArcs(); }
  getEpistemicLedgerCapable(): boolean { return this.memory.capable; }
  getEntities(): string[] { return this.memory.getEntities(); }
  async setArcPinned(id: string, pinned: boolean) { await this.memory.setArcPinned(id, pinned); }
  async removeArc(id: string) { await this.memory.removeArc(id); }
  getCanon(): string { return this.memory.getCanon(); }

  getPossibleTransitions(): string[] { return buildPossibleTransitions(this.loaded?.story ?? null, this.loaded ? this.engine.serialize() : null); }

  async regenerateCanon(force = false): Promise<boolean> { return this.memory.regenerateCanon(force); }
  scheduleExpansionForActive(schedule: (reason: string, run: () => Promise<void>) => void) { return this.expansion.scheduleForActive(schedule); }
  async runExpansionNow(debugResponse?: string) { return this.expansion.runNow(debugResponse); }

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
      lastRollback: this.lastRollback,
      ledger: this.memory.getLedger(),
      driver: this.copilot.getDriverContext(),
      activeNudge: this.copilot.getActiveNudge(),
      payloadCaptures: this.journal.getCaptures(),
    });
  }

  capturePayload(reason = "generation") {
    if (!this.loaded) return;
    const capture: PayloadCapture = { at: new Date().toISOString(), boundary: this.engine.serialize().boundary, reason, blocks: readInjectedPromptBlocks() };
    if (this.journal.capture(capture)) this.notify();
  }

  getPayloadCaptures(): PayloadCapture[] { return this.journal.getCaptures(); }

  private async loadStory(loaded: LoadedStory, mode: "activate" | "hydrate", knownPersisted: PersistedStoryRuntime | null = null) {
    this.validationErrors = [];
    this.pacing.clearPending();
    const persisted = mode === "hydrate" ? knownPersisted ?? loadPersistedRuntime(loaded.record.id) : null;
    const priorSessionAt = persisted?.extras?.lastSessionAt ?? null;
    liftLegacyChatSettings(persisted?.extras, String(getContext().chatId ?? "an earlier chat"));
    this.extras = hydrateExtras(persisted?.extras);
    this.journal.hydrate(this.extras.journal);
    this.loaded = { record: loaded.record, story: this.expansion.mergedStoryOrBase(loaded.record.raw, loaded.story) };
    this.engine.loadStory(this.loaded.story);
    this.refreshRequirements();
    if (mode === "hydrate" && persisted?.engineState) {
      this.engine.hydrate(persisted.engineState);
      await this.effects.applyCheckpoint(loaded.story, this.engine.activeCheckpoint, this.extras, this.getSnapshot(), "hydrate");
      this.status = `Continuing ${loaded.story.title}`;
    } else {
      await this.effects.applyCheckpoint(loaded.story, this.engine.activeCheckpoint, this.extras, this.getSnapshot(), "activate");
      this.status = `Started ${loaded.story.title}`;
    }
    this.pacing.updateSteering();
    this.memory.updateInjection();
    this.awayRecap.detect(priorSessionAt, this.getSnapshot().narrative);
    setSelectedStoryId(loaded.record.id);
    await this.persist();
    this.notify();
  }

  getNarrativeStatus(): NarrativeStatus { return this.getSnapshot().narrative; }
  getAwayRecap(): AwayRecap | null { return this.awayRecap.get(); }
  async showAwayRecap(): Promise<boolean> { return this.awayRecap.show(); }

  private async persist() {
    if (!this.loaded) return;
    this.extras.lastSessionAt = new Date().toISOString();
    savePersistedRuntime({
      storyId: this.loaded.record.id,
      storyTitle: this.loaded.story.title,
      pinnedStory: this.loaded.record.raw,
      playedVersion: this.loaded.record.version,
      contentHashAtLoad: this.loaded.record.hash,
      engineState: this.engine.serialize(),
      extras: stripGlobalSettings(this.extras),
    });
    await getContext().saveMetadata?.();
  }

  // The author edited this story from this chat: take the saved version without losing the run.
  // Every other chat keeps its pinned copy (spec addendum §Story identity).
  async applyStoryUpdate(record?: StoryLibraryRecord): Promise<StoryUpdateOutcome> { return applyStoryUpdate(this.storyUpdateDeps, record); }
  getLastStoryUpdate(): StoryUpdateOutcome | null { return this.lastStoryUpdate; }

  private async swapStory(loaded: LoadedStory, state: EngineState | null, reanchored: boolean) {
    this.loaded = loaded;
    this.engine.loadStory(loaded.story);
    if (state) this.engine.hydrate(state);
    this.refreshRequirements();
    this.expansion.revalidateInserted();
    await this.effects.applyCheckpoint(loaded.story, this.engine.activeCheckpoint, this.extras, this.getSnapshot(), reanchored ? "activate" : "hydrate");
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

  getEnabledCharacterIds(): string[] {
    return enabledCharacterIds(this.loaded?.story ?? null);
  }

  getActiveSpeakerId(): string | null {
    return activeSpeakerId(this.loaded?.story ?? null);
  }

  rosterIdForName(name: string): string | null {
    return rosterIdForName(this.loaded?.story ?? null, name);
  }

  onMemberDrafted(chId: number | [number]) { this.memory.onMemberDrafted(chId); }

  clearPrivateInjection() {
    if (!this.loaded) return;
    this.memory.updateInjection();
  }

  getEpistemic(): EpistemicEntry[] { return this.memory.getEpistemic(); }
  getLedger(): LedgerView[] { return this.memory.getLedger(); }
  getEpistemicBlock(): string { return this.memory.getEpistemicBlock(); }
  getLedgerBlock(): string { return this.memory.getLedgerBlock(); }

  setEpistemicLedgerCapable(capable: boolean) { this.setMemorySettings({ epistemicLedgerCapable: capable }); }

  async setEpistemicPinned(id: string, pinned: boolean) { await this.memory.setEpistemicPinned(id, pinned); }
  async removeEpistemicEntry(id: string) { await this.memory.removeEpistemicEntry(id); }
  async setLedgerPinned(id: string, pinned: boolean) { await this.memory.setLedgerPinned(id, pinned); }
  async removeLedgerEntry(id: string) { await this.memory.removeLedgerEntry(id); }
  getMemoryInjectionBlocks(): Record<MemoryTier, string> { return this.memory.getInjectionBlocks(); }

  async runConsolidation(): Promise<{ dropped: number; superseded: number; confirmed: number; uncertain: UncertainPair[] }> {
    return this.memory.runConsolidation();
  }

  async runSupersessionBridge(supersedingEntries: MemoryEntry[]): Promise<boolean> { return this.memory.runSupersessionBridge(supersedingEntries); }

  async syncWorldInfo(): Promise<MemoryMirrorSummary> {
    return this.memory.syncWorldInfo();
  }

  getStagecraftState(): StagecraftRuntimeState { return this.stagecraft.getState(); }
  setStagecraftSettings(settings: Partial<StagecraftSettings>) { setGlobalSettings({ stagecraft: settings }); this.refreshSettingsView(); }
  curatorDueForRun(): boolean { return this.stagecraft.dueForRun(); }
  async runWiCuratorPass(reason?: string, debugResponse?: string): Promise<CuratorPassOutcome> { return this.stagecraft.runCuratorPass(reason, debugResponse); }
  async setCuratorOpDecision(id: string, index: number, status: "accepted" | "rejected", op?: CuratorOp) { await this.stagecraft.setOpDecision(id, index, status, op); }
  async decideCuratorProposal(id: string, status: "accepted" | "rejected") { await this.stagecraft.decideProposal(id, status); }
  async applyCuratorProposals(): Promise<number> { return this.stagecraft.applyAccepted(); }

  private getBoundaryContext(): BoundaryContext {
    const chat = Array.isArray(getContext().chat) ? getContext().chat : [];
    return { lastMessageId: chat.length - 1, chatLength: chat.length };
  }

  private refreshRequirements() {
    this.extras.requirements = evaluateRequirements(this.loaded?.story ?? null);
    this.extras.updatedAt = new Date().toISOString();
  }
}

export const runtimeManager = new RuntimeManager();
