import { appendJudgeCall, type JudgeCallRecord, type SceneReadRecord } from "@judge/index";
import type { JudgeRuntime } from "./judge";
import { acceptModelCall, type ModelCallRecord } from "./modelCallLog";
import {
  StoryEngine, type RollbackOutcome, type ApplyQueueEntry, type BoundaryContext, type BoundaryLogEntry, type BoundaryResult, type EngineState,
  type NormalizedStoryV2, type NormalizedTransition, type TalkControl, type ValidationError,
} from "@engine/index";
import {
  type ExtractionScheduler, type ParsedDelta, type SchedulerJob, type SharedReadAudit, type SharedReadWindow,
} from "@extraction/index";
import { applyCommitEvidence } from "@extraction/commitGuard";
import { applyRatingGrounding } from "@extraction/ratingGuard";
import { clearAllMemoryInjection } from "@memory/index";
import {
  getContext, profileExists, readExtensionPromptBlocks, readInjectedPromptBlocks, showTextPopup,
} from "@services/STAPI";
import { createModelCall } from "./modelCall";
import { loadChapterKit } from "./chapterPort";
import { AwayRecapController, type AwayRecap } from "./awayRecap";
import type { NarrativeStatus, RollbackKind, RollbackNotice, RollbackUnavailable } from "./narrative";
import { coordinatorHosts } from "./coordinatorHosts";
import { wireCoordinators } from "./managerWiring";
import { activeSpeakerId, enabledCharacterIds, namesForRosterId, rosterIdForName } from "./roster";
import { EffectsApplier } from "./effectsApplier";
import { createExtras, hydrateExtras, TALK_DECISION_LIMIT } from "./extras";
import { SettingsControl } from "./settingsControl";
import { beginRun, type RunContext, type RunOwnership } from "./runToken";
import { RunOwner } from "./runOwner";
import { runRollback, type DecodeJournal } from "./rollback";
import { memoryActions, memoryDelegates } from "./memoryActions";
import { readEffectTarget, reconcileEffectLedger, restoreEffectTarget } from "./effectHost";
import { ChatSave } from "./chatSave";
import { hasUnsavedChanges } from "./saveHealth";
import { getGlobalSettings, setGlobalSettings, type SpikeSettings, type TalkChainSettings } from "./settingsStore";
import { buildPossibleTransitions } from "./snapshot";
import { buildRuntimeSnapshot, snapshotSources } from "./snapshotBuilder";
import { SnapshotCache } from "./snapshotCache";
import { applyStoryUpdate, type StoryUpdateOutcome } from "./storyUpdate";
import { parseQualityValue } from "./values";
import { SessionJournal, type JournalEvent, type JournalRecordKind } from "./journal";
import { evaluateRequirements, requirementsOptions } from "./requirements";
import type { RequirementsHost } from "./requirementsWatch";
import { getMetadataBlob, getSelectedStoryId, loadPersistedRuntime, setSelectedStoryId } from "./persistence";
import { findStoryRecord } from "./storyLibrary";
import { settingsRoot } from "./settingsRoot";
import { boundStoryForEmptyChat } from "./groupStoryBinding";
import { runResetQuality, runStepBackTransition, type RecoveryHost } from "./recovery";
import {
  importStoryJson, loadSelectedStory, releaseGatedWorldInfo, removeStory, restartStory, selectStory,
  type StorySelectionDeps,
} from "./storySelection";
import type {
  CopilotRuntimeSettings, PersistedStoryRuntime, ExtractionRuntimeSettings, ExtractionRuntimeState, LoadedStory,
  MemoryMirrorBook, MemoryRuntimeSettings, PacingSettings, PayloadCapture, RuntimeExtras, RuntimeSnapshot, StagecraftSettings,
  StoryLibraryRecord, TalkDecisionAudit, TalkRuntimeState, UiRuntimeSettings,
} from "./types";
import { withholds } from "./generationLifecycle";
import { onEnterRollbackPlan } from "./npcReplyRewind";
import { stagedPath } from "./worldInfoGates";
import type { MutationKind } from "./turnBridge";
import { CoordinatorDelegates } from "./managerDelegates";
import { required } from "@utils/guards";
import { spikeSeams } from "./spikeSeams";
import { recordLoreFired, type LoreFiredRecord } from "./loreFired";
import type { InlineSettings } from "./settingsModel";

const boundStoryForOpenChat = () => {
  const ctx = getContext();
  return boundStoryForEmptyChat(settingsRoot(), ctx.groupId, ctx.chat);
};

export class RuntimeManager extends CoordinatorDelegates {
  private engine = new StoryEngine({ now: () => Date.now(), derive: (view) => spikeSeams.derive?.(view) ?? [] });
  private loaded: LoadedStory | null = null;
  private loadedChatId: string | null = null;
  private extras: RuntimeExtras = createExtras(getGlobalSettings);
  private judge: JudgeRuntime | null = null;
  private validationErrors: ValidationError[] = [];
  private status = "No story loaded";
  private readonly owner = new RunOwner({
    openChatId: () => String(getContext().chatId ?? ""),
    storyId: () => this.loaded?.record.id ?? null,
    playedVersion: () => this.loaded?.record.version ?? null,
  });
  onEpochChanged(listener: () => void) { return this.owner.onChanged(listener); }
  invalidateRuns() { this.extractionHold = false; this.awayRecap.dismissUnless(String(getContext().chatId ?? "")); this.owner.bump(); }
  noteRecap(summary: string, detail: string, kind: JournalRecordKind = "story") { this.journal.record(kind, summary, this.journalContext(), detail); this.extras.journal = this.journal.getRecords(); }
  private readonly effects: EffectsApplier;
  private readonly listeners = new Set<() => void>();
  private readonly snapshotCache = new SnapshotCache<RuntimeSnapshot>(() => this.getSnapshot());
  private readonly boundaryListeners = new Set<(result: BoundaryResult) => void>();
  private readonly rollbackListeners = new Set<(messageId: number, window: SharedReadWindow) => void>();
  private readonly sceneBreakListeners = new Set<(audit: SharedReadAudit, collect?: SchedulerJob[]) => void>();
  private readonly arcResolvedListeners = new Set<(arcIds: string[]) => void>();
  private readonly awayRecap = new AwayRecapController((render) => showTextPopup(render, { okButton: "Continue" }), (summary, detail) => this.noteRecap(summary, detail));
  private readonly notices: { lastRollback: RollbackNotice | null; rollbackUnavailable: RollbackUnavailable | null } = { lastRollback: null, rollbackUnavailable: null };
  private readonly journal = new SessionJournal();
  readonly chatSave = new ChatSave({
    loaded: () => this.loaded,
    loadedChat: () => this.loadedChatId,
    engine: () => ({ state: this.engine.serialize(), history: this.engine.serializeHistory() }),
    extras: () => this.extras,
    owner: this.owner,
    journal: (summary, note, persistNow) => (persistNow ? this.noteRecap(summary, note) : this.journal.record("story", summary, this.journalContext(), note)),
    recap: (summary, detail) => this.noteRecap(summary, detail),
    rollback: (messageId, journal) => this.rollbackFromMessage(messageId, journal),
  });
  private readonly view = { getStory: () => this.loaded?.story ?? null, getState: () => (this.loaded ? this.engine.serialize() : null), hosts: coordinatorHosts };
  readonly model = createModelCall({
    settings: () => this.getExtractionSettings(), exists: profileExists, ownership: this.owner.ownership,
    stamp: () => ({ chatId: this.loadedChatId, messageId: this.getBoundaryContext().lastMessageId }),
  });
  private readonly lifecycle = { persist: () => this.persist(), notify: () => this.notify(), ownership: this.owner.ownership, model: this.model };
  protected readonly co = wireCoordinators({
    view: this.view, lifecycle: this.lifecycle, engine: this.engine, loaded: () => this.loaded, extras: () => this.extras, judge: () => this.judge,
    setStatus: (status) => { this.status = status; }, unsaved: () => !this.chatSave.landed(), commitBoundary: () => this.commitBoundary(),
    firedTransitions: () => this.getFiredTransitions(), gateSources: () => this.getExpansionGateSources(), replaceStory: (story) => this.replaceStory(story),
    enqueueExtractorDeltas: (accepted, window, origin) => this.enqueueExtractorDeltas(accepted, window, origin),
    fireSceneBreakReplies: async (breakAt) => { await this.effects.fireNpcReplies(this.engine.activeCheckpoint, this.extras, "sceneBreak", breakAt); },
    sceneBreakListeners: this.sceneBreakListeners, arcResolvedListeners: this.arcResolvedListeners,
    journal: (kind, summary, note) => { this.journal.record(kind, summary, this.journalContext(), note); this.extras.journal = this.journal.getRecords(); },
    announce: (text) => this.effects.announceText(text, this.extras, this.owner.ownsOpenChat()),
    rollback: {
      journal: this.journal, context: () => ({ ...this.getBoundaryContext(), journal: this.journalContext() }), refreshRequirements: () => this.refreshRequirements(),
      reapplyCheckpoint: async (messageId) => { await this.effects.restoreFor(this.extras, { since: messageId }); await this.applyActive("hydrate"); },
      notices: this.notices, onApplied: (messageId, window) => this.rollbackListeners.forEach((listener) => listener(messageId, window)),
    },
    storyUpdate: {
      swapStory: (loaded, state, reanchored) => this.swapStory(loaded, state, reanchored), restart: () => this.restartStory(true),
      journal: (outcome) => {
        this.lastStoryUpdate = outcome;
        this.journal.record("story",
            `story updated v${outcome.fromVersion} → v${outcome.toVersion} (${outcome.classification}${outcome.choice ? `, ${outcome.choice}` : ""})`,
            this.journalContext(), outcome.reason);
        this.extras.journal = this.journal.getRecords();
      },
    },
  });
  private readonly memory = this.co.memory;
  private readonly expansion = this.co.expansion;
  private readonly extraction = this.co.extraction;
  private readonly pacing = this.co.pacing;
  private readonly stagecraft = this.co.stagecraft;
  private readonly copilot = this.co.copilot;
  readonly memoryActions = memoryActions(memoryDelegates(this.memory));
  private lastStoryUpdate: StoryUpdateOutcome | null = null;

  constructor() {
    super();
    this.effects = new EffectsApplier(this.owner.ownership, { reads: { read: readEffectTarget },
        restore: restoreEffectTarget, persist: () => this.persist(),
        unsaved: () => hasUnsavedChanges(this.extras.saveHealth), journal: (summary, note) => this.noteRecap(summary,
        note ?? ""), roll: (key) => spikeSeams.npcRoll?.(key) ?? null });
  }

  subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }

  notify() {
    this.snapshotCache.invalidate();
    if (this.journal.observeStatus(this.status, this.journalContext())) this.extras.journal = this.journal.getRecords();
    this.listeners.forEach((listener) => listener());
  }

  private journalContext() { const state = this.loaded ? this.engine.serialize() : null; return { boundary: state?.boundary ?? 0, messageId: state?.lastMessageId ?? -1 }; }

  getSessionJournal(): JournalEvent[] {
    const { extraction, talk, judge } = this.extras;
    return this.journal.build({ boundaryLog: this.loaded ? this.engine.stateLog : [], audits: extraction.audits,
        reconciliationEvents: extraction.reconciliationEvents, talkDecisions: talk.decisions,
        judgeCalls: judge.calls, modelCalls: this.extras.modelCalls, pending: this.loaded ? this.engine.pendingWrites : [] });
  }
  getExtractionAudits() { return this.extras.extraction.audits; }
  async flagMoment(note = "") {
    this.journal.flag(note, this.journalContext());
    this.extras.journal = this.journal.getRecords();
    await this.persist();
    this.notify();
  }

  onBoundary(listener: (result: BoundaryResult) => void) { this.boundaryListeners.add(listener); return () => { this.boundaryListeners.delete(listener); }; }
  ownsImageChat(chatId: string): boolean {
    if (!this.loaded || this.owner.claimedChat() !== chatId || !this.owner.ownsOpenChat()) return false;
    const blob = getMetadataBlob();
    return blob.chatId === chatId && blob.selectedStoryId === this.loaded.record.id;
  }
  onRollback(listener: (messageId: number, window: SharedReadWindow) => void) { this.rollbackListeners.add(listener); return () => { this.rollbackListeners.delete(listener); }; }
  onSceneBreakConfirmed(listener: (audit: SharedReadAudit, collect?: SchedulerJob[]) => void) { this.sceneBreakListeners.add(listener); return () => { this.sceneBreakListeners.delete(listener); }; }
  onArcsResolvedConfirmed(listener: (arcIds: string[]) => void) { this.arcResolvedListeners.add(listener); return () => { this.arcResolvedListeners.delete(listener); }; }

  private readonly selectionDeps: StorySelectionDeps = {
    loadStory: (loaded, mode, persisted) => this.loadStory(loaded, mode, persisted ?? null),
    restoreEffects: async (scope) => { await this.effects.restoreFor(this.extras, scope); },
    beginRun: () => beginRun(this.owner.ownership),
    clearStory: async (status, note) => {
      if (note) this.journal.record("story", status, this.journalContext(), note);
      const previous = this.loaded?.story ?? null;
      this.loaded = null;
      this.loadedChatId = null;
      this.invalidateRuns();
      const run = beginRun(this.owner.ownership);
      await this.effects.restoreFor(this.extras, "exit");
      if (!run.stillOwns()) return;
      this.extras = createExtras(getGlobalSettings);
      this.pacing.clearPending();
      this.pacing.updateSteering();
      clearAllMemoryInjection(coordinatorHosts.prompt);
      this.status = status;
      this.notify();
      await releaseGatedWorldInfo(this.effects, previous, null, run);
      if (!run.stillOwns()) return;
    },
    fail: (errors, status) => { this.validationErrors = errors; this.status = status; this.notify(); },
    warn: (warnings) => this.noteRecap(`story imported with ${warnings.length} warning(s)`, warnings.map((warning) => `${warning.path}: ${warning.message}`).join("\n")),
    setStatus: (status, note) => { if (note) this.noteRecap(status, note); this.status = status; this.notify(); },
    isLoaded: (id) => this.loaded?.record.id === id,
    loadedFallback: () => (this.loaded ? { ...this.loaded } : null),
  };

  async loadSelectedFromChat() {
    if (await loadSelectedStory(this.selectionDeps)) { void this.showAwayRecap().then((shown) => !shown && this.memory.chapters.showPreviously()); return; }
    if (getSelectedStoryId()) return;
    const run = beginRun(this.owner.ownership);
    const id = boundStoryForOpenChat();
    if (id && findStoryRecord(id) && run.stillOwns()) await selectStory(this.selectionDeps, id);
  }

  async importStory(rawText: string) { return importStoryJson(this.selectionDeps, rawText); }
  async selectStory(id: string, _mode: "activate" | "hydrate" = "activate") { return selectStory(this.selectionDeps, id); }
  async restartStory(alreadyConfirmed = false): Promise<boolean> { return restartStory(this.selectionDeps, this.loaded?.record.id ?? null, alreadyConfirmed); }
  async removeStory(id: string): Promise<boolean> { return removeStory(this.selectionDeps, id); }

  async commitBoundary(at?: number) {
    if (!this.loaded) return null;
    const run = beginRun(this.owner.ownership);
    this.notices.lastRollback = null;
    if (!(await this.chatSave.reconcile(run))) return null;
    this.refreshRequirements();
    this.expansion.revalidateInserted();
    const pendingBridges = this.memory.enqueueArcBridges();
    const result = this.engine.commitBoundary(this.getBoundaryContext(at));
    this.memory.markBridgesApplied(pendingBridges);
    if (result.fired) {
      await this.effects.announceTransition(this.engine.activeCheckpoint, this.extras, this.owner.ownsOpenChat());
      if (!run.stillOwns()) return null;
    }
    if (result.effects) await this.applyActive("activate", result.fired ? result.context.lastMessageId : undefined);
    else if (this.extras.requirements.ready && this.extras.lastAppliedCheckpointId !== this.engine.activeCheckpoint.id) await this.applyActive("hydrate");
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
    this.boundaryListeners.forEach((listener) => listener(result));
    this.notify();
    return result;
  }

  private recoveryHost(): RecoveryHost {
    return {
      loaded: Boolean(this.loaded), engine: this.engine, ownership: this.owner.ownership,
      applyActive: (mode) => this.applyActive(mode), refreshRequirements: () => this.refreshRequirements(),
      announce: (checkpoint) => this.effects.announceTransition(checkpoint, this.extras, this.owner.ownsOpenChat()),
      updateSteering: () => this.pacing.updateSteering(), updateInjection: () => this.memory.updateInjection(),
      persist: () => this.persist(), setStatus: (text) => { this.status = text; },
      noteRecap: (summary, detail) => this.noteRecap(summary, detail), notify: () => this.notify(),
    };
  }
  async stepBackTransition() { return runStepBackTransition(this.recoveryHost()); }
  async resetQuality(key: string) { return runResetQuality(this.recoveryHost(), key); }

  async activateCheckpoint(id: string) {
    if (!this.loaded) return false;
    const kit = await loadChapterKit();
    const jump = await kit.confirmChapterJump(this.memory.chapters, id);
    if (jump === "cancel" || !this.loaded) { this.status = "Jump cancelled."; return false; }
    const run = beginRun(this.owner.ownership);
    this.refreshRequirements();
    await this.effects.releaseStaging(this.loaded.story, this.extras, run);
    if (!run.stillOwns()) return false;
    const context = this.getBoundaryContext();
    if (jump === "skip") kit.markSealSkip(this.memory.chapters, { pathLength: this.engine.checkpointPath.length + 1, messageId: context.lastMessageId });
    this.engine.activateCheckpoint(id, context);
    await this.applyActive("activate");
    if (!run.stillOwns()) return false;
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

  async rollbackFromMessage(messageId: number, decoded?: DecodeJournal, kind?: RollbackKind): Promise<RollbackOutcome> {
    // A mutation's POSITION is recorded: an in-flight read whose window reaches it is invalidated,
    // a reply merely appended later is not. See `tokenMatches`.
    this.owner.noteMutation(messageId); this.chatSave.fingerprints.forgetFrom(messageId);
    if (!this.loaded) return { ok: true, result: "noop" };
    const run = runRollback(this.co.rollbackDeps, messageId, decoded, kind);
    this.rollbackRun = Promise.allSettled([this.rollbackRun, run]);
    return run;
  }
  async rollbackOnEnter(kind: MutationKind, messageId: number): Promise<boolean> {
    const plan = this.loaded ? onEnterRollbackPlan(this.extras.onEnterPosts, kind, messageId, this.getBoundaryContext().chatLength) : null;
    if (!plan) return false;
    const run = beginRun(this.owner.ownership);
    await this.rollbackFromMessage(plan.from, { summary: plan.summary, note: plan.note });
    if (run.stillOwns()) await this.effects.removeOnEnterPost(plan.remove, run);
    return true;
  }
  private rollbackRun: Promise<unknown> = Promise.resolve();
  rollbackSettled(): Promise<unknown> { return this.rollbackRun; }

  getStory(): NormalizedStoryV2 | null { return this.loaded?.story ?? null; }
  // What this chat is actually playing, authored form — the Studio edits this, not the library's copy.
  getPlayedStoryRaw(): unknown { return this.loaded?.record.raw ?? null; }
  getEngineState(): EngineState | null { return this.loaded ? this.engine.serialize() : null; }
  getMirrorBook(): MemoryMirrorBook | null { return this.extras.memory.wiBook; }
  getExtractionSettings(): ExtractionRuntimeSettings { return this.extras.extraction.settings; }

  private reconcileEffectLedger() {
    const { rows, notes } = reconcileEffectLedger(this.extras.effects.ledger);
    this.extras.effects.ledger = rows;
    notes.forEach((note) => this.noteRecap(note, ""));
  }

  private readonly settingsControl = new SettingsControl({ extras: () => this.extras,
      updateSteering: () => this.pacing.updateSteering(), updateInjection: () => this.memory.updateInjection(),
      clearNudge: () => this.clearCopilotNudge(), ...this.lifecycle });
  setExtractionSettings(settings: Partial<ExtractionRuntimeSettings>) { this.settingsControl.extraction(settings); }
  setPacingSettings(settings: Partial<PacingSettings>) { this.settingsControl.pacing(settings); }
  setMemorySettings(settings: Partial<MemoryRuntimeSettings>) { this.settingsControl.memory(settings); }
  setCopilotSettings(settings: Partial<CopilotRuntimeSettings>) { this.settingsControl.copilot(settings); }
  setUiSettings(settings: Partial<UiRuntimeSettings>) { this.settingsControl.ui(settings); }

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

  getTalkChainConfig() { return getGlobalSettings().talk.chain; }

  setTalkChainSettings(chain: Partial<TalkChainSettings>) {
    const current = getGlobalSettings().talk.chain;
    setGlobalSettings({ talk: { chain: { ...current, ...chain } } });
    this.notify();
  }

  private extractionHold = false;
  setExtractionHold(hold: boolean) { this.extractionHold = hold; }
  isExtractionHeld() { return this.extractionHold; }

  recordLoreFired(record: LoreFiredRecord) { if (!this.loaded) return; this.extras.lore = recordLoreFired(this.extras.lore, record); void this.persist(); this.notify(); }
  setInlineSettings(patch: Partial<InlineSettings>) { this.setUiSettings({ inline: { ...this.extras.ui.inline, ...patch } }); }
  recordJudgeCall(record: JudgeCallRecord) { this.extras.judge = appendJudgeCall(this.extras.judge, record); this.touch(); }
  recordModelCall(record: ModelCallRecord) { this.extras.modelCalls = acceptModelCall(this.extras.modelCalls, record, this.loadedChatId); this.touch(); }
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

  getCopilotSettings(): CopilotRuntimeSettings { return this.extras.copilot; }
  getUiSettings(): UiRuntimeSettings { return this.extras.ui; }
  getGlobalSettings() { return getGlobalSettings(); }

  reapplyPromptBlocks() { this.copilot.reapplyNudge(); if (!this.loaded) return; this.memory.updateInjection(); this.pacing.updateSteering(); }
  getBoundaryLog(): BoundaryLogEntry[] { return this.loaded ? this.engine.stateLog : []; }

  getFiredTransitions(): NormalizedTransition[] { return this.engine.stateLog.map((entry) => entry.fired).filter((transition): transition is NormalizedTransition => Boolean(transition)); }

  setSchedulerSnapshot(snapshot: ExtractionRuntimeState["scheduler"]) {
    this.extraction.setSchedulerSnapshot(snapshot);
    this.expansion.setSchedulerSnapshot(snapshot);
    void this.persist();
    this.notify();
  }

  private scheduler: ExtractionScheduler | null = null;
  attachScheduler(scheduler: ExtractionScheduler | null) { this.scheduler = scheduler; }
  async retryExtraction(): Promise<boolean> { return this.scheduler?.probe("player") ?? false; }

  private enqueueExtractorDeltas(acceptedDeltas: ParsedDelta[], window: { from: number; to: number }, origin: string) {
    if (!acceptedDeltas.length) return;
    const story = this.loaded?.story ?? null;
    const committed = story ? applyCommitEvidence(story, acceptedDeltas, () => this.view.hosts.chat.chatWindow(window.from, window.to).messages) : { accepted: acceptedDeltas, held: [] };
    this.journalHeld(`${committed.held.length} commitment reading(s) held: no line the player wrote in the window shows the commitment`, committed.held);
    const guarded = story ? applyRatingGrounding(story.qualityByKey, this.engine.serialize().blackboard.values, committed.accepted) : committed;
    this.journalHeld(`${guarded.held.length} rating reading(s) held: the evidence did not ground the level`, guarded.held);
    if (!guarded.accepted.length) return;
    const tensionLevels = this.pacing.applyExtractorTension(guarded.accepted);
    const versions = this.engine.serialize().blackboard.versions;
    this.engine.enqueue({ source: "extractor", origin, blackboardVersionSum: Object.values(versions).reduce((sum,
        version) => sum + version, 0), turnRange: window, deltas: guarded.accepted.map((entry) => entry.delta),
        ...(tensionLevels.length ? { tensionLevels } : {}) });
  }

  private journalHeld(summary: string, held: Array<{ key: string; value: string; evidence: string; reason?: string }>) {
    if (!held.length) return;
    this.journal.record("story", summary, this.journalContext(),
        held.map((entry) => `${entry.key}="${entry.value}"${entry.reason ? ` (${entry.reason})` : ""} from "${entry.evidence.slice(0, 120)}"`).join("; "));
    this.extras.journal = this.journal.getRecords();
  }

  attachJudge(judge: JudgeRuntime) { this.judge = judge; }
  getJudge(): JudgeRuntime | null { return this.judge; }
  private sceneRunner: { rerun(): Promise<unknown> } | null = null;
  attachScene(scene: { rerun(): Promise<unknown> } | null) { this.sceneRunner = scene; }
  readonly previewActions = { clearNote: () => this.stagecraft.clearContinuityNote(), rerunScene: async () => { await this.sceneRunner?.rerun(); } };
  getPossibleTransitions(): string[] { return buildPossibleTransitions(this.loaded?.story ?? null, this.loaded ? this.engine.serialize() : null); }
  private rejectQuality(reason: string): false { this.status = reason; this.notify(); return false; }
  readonly expansions = { commitValidated: () => this.expansion.commitValidated(), regenerate: (key: string) => this.expansion.regenerate(key) };
  readonly writes = { pending: (): ApplyQueueEntry[] => (this.loaded ? this.engine.pendingWrites : []),
    requeue: (entries: ApplyQueueEntry[]) => { if (this.loaded) entries.forEach((entry) => this.engine.enqueue(entry)); } };

  /** The identity in-flight work is checked against, for writers constructed outside the manager; read-only. */
  getOwnership(): RunOwnership { return this.owner.ownership; }

  getRunContext(): RunContext { return this.owner.context(); }

  getCachedSnapshot(): RuntimeSnapshot { return this.snapshotCache.read(); }
  touch() { this.snapshotCache.invalidate(); }

  getSnapshot(): RuntimeSnapshot {
    return buildRuntimeSnapshot(snapshotSources({
      ...this.co, loaded: this.loaded, engine: this.engine, extras: this.extras, validationErrors: this.validationErrors, status: this.status,
      notices: this.notices, payloadCaptures: this.journal.getCaptures(), extractionHealth: this.scheduler?.health() ?? null,
      // A live in-memory read of ST's own extension prompts: cheap, and the only honest answer to
      // "what will the next reply carry" (a capture answers what the LAST one carried).
      promptBlocks: readExtensionPromptBlocks(), chat: getContext().chat ?? [], fingerprints: this.chatSave.fingerprints.current,
      characters: getContext().characters ?? [],
    }));
  }

  capturePayload(reason = "generation", type: string | null = null) {
    if (!this.loaded) return;
    const length = Array.isArray(getContext().chat) ? getContext().chat.length : 0;
    const messageId = type === "swipe" || type === "continue" ? length - 1 : length;
    const capture: PayloadCapture = { at: new Date().toISOString(), boundary: this.engine.serialize().boundary, messageId, reason, blocks: readInjectedPromptBlocks() };
    if (this.journal.capture(capture)) this.notify();
  }

  getPayloadCaptures(): PayloadCapture[] { return this.journal.getCaptures(); }
  noteFolded(folded: number) { if (this.journal.noteFolded(folded)) this.notify(); }

  private async loadStory(loaded: LoadedStory, mode: "activate" | "hydrate", knownPersisted: PersistedStoryRuntime | null = null) {
    const previous = this.loaded?.story ?? null;
    this.validationErrors = [];
    this.pacing.clearPending();
    const persisted = mode === "hydrate" ? knownPersisted ?? loadPersistedRuntime(loaded.record.id) : null;
    const priorSessionAt = persisted?.extras?.lastSessionAt ?? null;
    this.invalidateRuns();
    this.extras = hydrateExtras(persisted?.extras, getGlobalSettings); this.chatSave.fingerprints.load(persisted?.fingerprints);
    this.journal.hydrate(this.extras.journal);
    this.reconcileEffectLedger();
    this.loaded = { record: loaded.record, story: this.expansion.mergedStoryOrBase(loaded.record.raw, loaded.story) };
    this.loadedChatId = this.owner.claimedChat();
    // Minted *after* the load names its world: a token taken before it describes the world being replaced.
    const run = beginRun(this.owner.ownership);
    this.engine.loadStory(this.loaded.story);
    this.refreshRequirements();
    // The history travels WITH the state: `hydrate` clears the log before restoring what it is handed.
    const saved = mode === "hydrate" ? persisted?.engineState ?? null : null;
    if (saved) this.engine.hydrate(saved, persisted?.engineHistory ?? null); else this.memory.markStoryStart();
    await this.effects.applyCheckpoint(loaded.story, this.engine.activeCheckpoint, this.extras, this.getSnapshot(), saved ? "hydrate" : "activate",
      stagedPath(this.engine.checkpointPath, this.engine.serialize().stagedFrom));
    // A superseded load stops here: its tail used to retitle the newer load, release ITS gated lore and
    // select the old id, and only the current load may queue a recap.
    await releaseGatedWorldInfo(this.effects, previous, loaded.story, run);
    if (!run.stillOwns()) return this.noteRecap("away recap skipped", `a later world change superseded this load: ${run.lapsedDetail() ?? "no detail"}`);
    if (saved) { await this.stagecraft.reconcileWriteAhead(); if (!run.stillOwns()) return; }
    this.status = `${saved ? "Continuing" : "Started"} ${loaded.story.title}${this.engine.hydrateRepair ? ` — ${this.engine.hydrateRepair}` : ""}`;
    this.pacing.updateSteering();
    this.memory.updateInjection();
    this.awayRecap.detect(priorSessionAt, this.getSnapshot().narrative, String(getContext().chatId ?? ""));
    setSelectedStoryId(loaded.record.id);
    await this.persist(); if (saved) await this.chatSave.reconcile(run);
    this.notify();
  }

  getNarrativeStatus(): NarrativeStatus { return this.getSnapshot().narrative; }
  getAwayRecap(): AwayRecap | null { return this.awayRecap.get(); }
  async showAwayRecap(): Promise<boolean> { return this.awayRecap.show(); }

  private persist() { this.snapshotCache.invalidate(); return this.chatSave.persist(); }

  // The author edited this story from this chat: take the saved version without losing the run.
  // Every other chat keeps its pinned copy (spec addendum §Story identity).
  async applyStoryUpdate(record?: StoryLibraryRecord): Promise<StoryUpdateOutcome> { return applyStoryUpdate(this.co.storyUpdateDeps, record); }
  getLastStoryUpdate(): StoryUpdateOutcome | null { return this.lastStoryUpdate; }

  private async swapStory(loaded: LoadedStory, state: EngineState | null, reanchored: boolean) {
    const previous = this.loaded?.story ?? null;
    this.loaded = loaded;
    this.loadedChatId = this.owner.claimedChat();
    const run = beginRun(this.owner.ownership);
    this.engine.loadStory(loaded.story);
    if (state) this.engine.hydrate(state);
    this.refreshRequirements();
    this.expansion.revalidateInserted();
    await this.applyActive(reanchored ? "activate" : "hydrate");
    await releaseGatedWorldInfo(this.effects, previous, loaded.story, run);
    if (!run.stillOwns()) return;
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
    this.loaded = { ...this.loaded, story };
    this.engine.replaceGraph(story);
  }

  getEnabledCharacterIds(): string[] { return enabledCharacterIds(this.loaded?.story ?? null, coordinatorHosts.roster); }

  getActiveSpeakerId(): string | null { return activeSpeakerId(this.loaded?.story ?? null, coordinatorHosts.roster); }

  rosterIdForName(name: string): string | null { return rosterIdForName(this.loaded?.story ?? null, name); }

  onGenerationStarted(type: unknown, dryRun?: unknown) {
    if (withholds(type)) this.withholdTurnBlocks(); else { this.memory.releaseStaleHold(); this.pacing.releaseStaleGuidanceHold(); this.memory.injector.onSoloGeneration(); }
    this.memory.chapters.carryBridge(type);
    this.stagecraft.onGenerationStarted(type, dryRun);
  }

  clearPrivateInjection() { if (!this.loaded) return; this.memory.releasePrivateInjection(); this.pacing.releaseDraftGuidance(); }

  setEpistemicLedgerCapable(capable: boolean) { this.setMemorySettings({ epistemicLedgerCapable: capable }); }

  setStagecraftSettings(settings: Partial<StagecraftSettings>) { this.settingsControl.stagecraft(settings); }

  setScanMemory(on: boolean) { this.settingsControl.scanMemory(on); }

  setSpikeFlags(flags: Partial<SpikeSettings>) { setGlobalSettings({ spikes: flags }); }

  private getBoundaryContext(at?: number): BoundaryContext { const chat = Array.isArray(getContext().chat) ? getContext().chat : []; const last = at === undefined ? chat.length - 1 : Math.min(at,
      chat.length - 1); return { lastMessageId: last, chatLength: last + 1 }; }

  private applyActive(mode: "activate" | "hydrate", gate?: number) { return this.effects.applyCheckpoint(required(this.loaded, "loaded story").story,
      this.engine.activeCheckpoint, this.extras, this.getSnapshot(), mode, stagedPath(this.engine.checkpointPath, this.engine.serialize().stagedFrom), gate); }
  private refreshRequirements() {
    this.extras.requirements = evaluateRequirements(this.loaded?.story ?? null, requirementsOptions(this.extras.memory.wiBook),
      this.extras.effects.cast.filter((entry) => entry.disabled).map((entry) => entry.member.replace(/\.[a-z0-9]+$/i, "")));
    this.extras.updatedAt = new Date().toISOString();
  }
  readonly requirementsHost: RequirementsHost = { ...this.lifecycle, hydrate: () => this.applyActive("hydrate"), refresh: () => {
    const before = this.extras.requirements.ready;
    this.refreshRequirements();
    return this.loaded ? { before, after: this.extras.requirements.ready, behind: this.extras.lastAppliedCheckpointId !== this.engine.activeCheckpoint.id } : null;
  } };
}
export const runtimeManager = new RuntimeManager();
