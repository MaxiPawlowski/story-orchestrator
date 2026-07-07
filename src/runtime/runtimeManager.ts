import { Blackboard, StoryEngine, effectiveThresholdFor, evaluateGate, isValidationErrorList, progressQualityForAnchor, renderGateText, TENSION_CURRENT_KEY, type ApplyQueueEntry, type ArcTemplate, type BlackboardDelta, type BoundaryContext, type BoundaryResult, type EngineState, type NormalizedStoryV2, type NormalizedTransition, type PrimitiveValue, type StoryV2, type TensionLevel, type ValidationError } from "@engine/index";
import { runAuthoringStage, runDriverReport, runDriverSuggest, type CopilotMessage, type CopilotStage, type DriverContext, type ProposalResult, type Suggestion } from "@copilot/index";
import { callExtractionModel, deriveFullScope, deriveScope, getCanonLite, getChatWindow, getLastMessageText, runSharedRead, stripChannelNoise, type ParsedDelta, type ParsedFact, type SharedReadAudit, type SharedReadWindow } from "@extraction/index";
import { findStubExpansionCandidate, collectExpansionGateSources, generateReviewedBeats, insertedCheckpointIds, mergeExpansions, planExpansion, revalidateExpansion, type ExpansionCacheEntry, type ExpansionRuntimeState, type StubExpansionCandidate } from "@generation/index";
import { addMemoryEntries, applyArcSignals, applyConsolidation, applyEpistemicInjection, applyEpistemicSignals, applyLedgerInjection, applyLedgerSignals, applyMemoryInjection, ARC_OPEN_INJECT_LIMIT, buildBoundKeySet, buildEpistemicPassPrompt, buildLedgerPassPrompt, buildLedgerView, capEpistemic, capLedger, clearEpistemicInjection, activeEpistemic, memoryExtensionKey, parseEpistemicLine, parseEpistemicRetire, parseLedgerLine, removeEpistemic, removeLedger, renderLedgerBlock, renderPrivateEpistemicBlock, rollbackEpistemic, rollbackLedger, setEpistemicPinned, setLedgerPinned, type EpistemicEntry, type LedgerBinding, type LedgerView, type ParsedEpistemicSignal, type ParsedLedgerSignal, buildArcSummaryPrompt, buildCanonSummaryPrompt, buildJaccardMatchSets, buildMemoryInjectionBlocks, buildSceneSummaryPrompt, buildShortTermSummaryPrompt, canonInputHash, capAllTiers, capOpenArcs, capResolvedArcs, clearAllMemoryInjection, CONSOLIDATION_MIN_GROUP, consolidateTier, createMemoryState, DEFAULT_DEDUP_THRESHOLDS, DEFAULT_TIER_BUDGETS, DEFAULT_TIER_TOKEN_BUDGETS, detectSceneBreakHeuristic, dropByMessageId, editEntryText, excludeEntry, expireScoped, generateMemoryId, hashMemoryText, markContradicted, matchArcBridges, openArcTexts, removeArc, resolvedArcs, rollbackArcs, setArcPinned, setArcSummary, setPinned, type ArcEntry, type MatchSets, type MemoryEntry, type MemoryTier, type ParsedArcSignal, type ParsedMemoryLine, type ScoreContext, type UncertainPair } from "@memory/index";
import { expectedTension, getSteeringHint, levelToNumeric, numericToLevel, updateEma } from "@pacing/index";
import { clearStoryExtensionPrompt, countTokens, DEFAULT_VECTOR_SOURCE, disableWIEntry, getActiveGroup, getCharacterNameById, getContext, readInjectedPromptBlocks, resolveGroupMemberId, setStoryExtensionPrompt, showTextPopup, upsertWIEntry, vectorInsert, vectorPurge, vectorQuery } from "@services/STAPI";
import { buildAwayRecap, shouldShowAwayRecap, type AwayRecap } from "./awayRecap";
import { COPILOT_NUDGE_KEY, DEFAULT_TENSION_EMA_ALPHA, EPISTEMIC_INJECTION_DEPTH, LEDGER_INJECTION_DEPTH, MEMORY_TIER_INJECTION_DEPTHS, PACING_HINT_DEPTH, PACING_HINT_EXTENSION_KEY, SHORT_TERM_COMPACTION_MESSAGES } from "@constants/defaults";
import { EffectsApplier } from "./effectsApplier";
import { evaluateRequirements } from "./requirements";
import { loadPersistedRuntime, savePersistedRuntime, setSelectedStoryHash, getSelectedStoryHash } from "./persistence";
import { findStoryRecord, listStoryRecords, loadStoryRecord, saveStoryRecord } from "./storyLibrary";
import type { ConvergenceReadout, CopilotRuntimeSettings, ExtractionRuntimeSettings, ExtractionRuntimeState, LoadedStory, MemoryBackfillState, MemoryRuntimeSettings, MemoryRuntimeState, PacingSettings, PayloadCapture, RuntimeExtras, RuntimeSnapshot, TensionRuntimeState } from "./types";

const emptyRequirements = { ready: true, missingPersonas: [], missingMembers: [], missingLorebooks: [] };

const defaultExtractionSettings = (): ExtractionRuntimeSettings => ({ enabled: false, profileId: null, cadence: 3, reconciliationMultiplier: 1.5, stabilityLag: 0 });

const defaultPacingSettings = (): PacingSettings => ({ alpha: DEFAULT_TENSION_EMA_ALPHA, shapeOverride: null, hintEnabled: true });

const defaultTension = (): TensionRuntimeState => ({ levels: [], smoothed: null });

const sanitizePacing = (value: PacingSettings | undefined): PacingSettings => ({
  ...defaultPacingSettings(),
  ...(value ?? {}),
  alpha: typeof value?.alpha === "number" && value.alpha >= 0 && value.alpha <= 1 ? value.alpha : DEFAULT_TENSION_EMA_ALPHA,
});

const sanitizeTension = (value: TensionRuntimeState | undefined): TensionRuntimeState => ({
  levels: Array.isArray(value?.levels) ? value.levels.slice(-50) : [],
  smoothed: typeof value?.smoothed === "number" ? value.smoothed : null,
});

const createExtraction = (): ExtractionRuntimeState => ({
  settings: defaultExtractionSettings(),
  audits: [],
  reconciliationEvents: [],
  lastReadBoundary: 0,
  scheduler: { queueDepth: 0, inFlight: false, lastError: null },
});

const createExpansion = (): ExpansionRuntimeState => ({
  entries: {},
  scheduler: { queueDepth: 0, inFlight: false, lastError: null },
});

const defaultMemorySettings = (): MemoryRuntimeSettings => ({
  enabled: true,
  epistemicLedgerCapable: true,
  injectionDepths: { ...MEMORY_TIER_INJECTION_DEPTHS },
  tierBudgets: { ...DEFAULT_TIER_BUDGETS },
  tierTokenBudgets: { ...DEFAULT_TIER_TOKEN_BUDGETS },
});

const createMemory = (): MemoryRuntimeState => ({
  ...createMemoryState(),
  settings: defaultMemorySettings(),
  backfill: null,
  sceneCount: 0,
  shortTermSummaryEnd: -1,
  wiWrites: {},
  arcs: [],
  epistemic: [],
  ledger: [],
  canon: null,
  updatedAt: new Date().toISOString(),
});

const migrateLegacyFacts = (facts: ParsedFact[]): MemoryEntry[] => facts.map((fact) => ({
  id: generateMemoryId(),
  tier: "facts",
  text: fact.text,
  type: "fact",
  importance: fact.importance,
  expiration: "permanent",
  entities: [],
  confidence: 1,
  activationTriggers: [],
  evidence: fact.evidence,
  createdAt: fact.boundary ?? 0,
  messageId: fact.messageId,
  recallCount: 0,
}));

const sanitizeMemory = (value: RuntimeExtras | undefined): MemoryRuntimeState => {
  const existing = value?.memory;
  if (existing && Array.isArray(existing.entries)) {
    return {
      entries: existing.entries.map((entry) => ({ ...entry, text: stripChannelNoise(entry.text) })),
      excluded: Array.isArray(existing.excluded) ? existing.excluded : [],
      writeLog: Array.isArray(existing.writeLog) ? existing.writeLog.slice(-100) : [],
      settings: { ...defaultMemorySettings(), ...existing.settings },
      backfill: existing.backfill ? { ...existing.backfill, running: false } : null,
      sceneCount: typeof existing.sceneCount === "number" ? existing.sceneCount : 0,
      shortTermSummaryEnd: typeof existing.shortTermSummaryEnd === "number" ? existing.shortTermSummaryEnd : -1,
      wiWrites: existing.wiWrites && typeof existing.wiWrites === "object" ? existing.wiWrites : {},
      arcs: Array.isArray(existing.arcs) ? existing.arcs.map((arc) => ({ ...arc, text: stripChannelNoise(arc.text), ...(arc.summary ? { summary: stripChannelNoise(arc.summary) } : {}) })) : [],
      epistemic: Array.isArray(existing.epistemic) ? existing.epistemic : [],
      ledger: Array.isArray(existing.ledger) ? existing.ledger : [],
      canon: existing.canon && typeof existing.canon === "object" ? { ...existing.canon, text: stripChannelNoise(existing.canon.text) } : null,
      updatedAt: existing.updatedAt ?? new Date().toISOString(),
    };
  }
  const legacyFacts = (value?.extraction as unknown as { facts?: ParsedFact[] } | undefined)?.facts;
  return {
    entries: Array.isArray(legacyFacts) ? migrateLegacyFacts(legacyFacts) : [],
    excluded: [],
    writeLog: [],
    settings: defaultMemorySettings(),
    backfill: null,
    sceneCount: 0,
    shortTermSummaryEnd: -1,
    wiWrites: {},
    arcs: [],
    epistemic: [],
    ledger: [],
    canon: null,
    updatedAt: new Date().toISOString(),
  };
};

const PAYLOAD_CAPTURE_LIMIT = 5;
const createCopilot = (): CopilotRuntimeSettings => ({ enabled: true });
const sanitizeCopilot = (value: RuntimeExtras | undefined): CopilotRuntimeSettings => ({ enabled: value?.copilot?.enabled ?? true });

const createExtras = (): RuntimeExtras => ({
  firedNpcReplies: {},
  requirements: emptyRequirements,
  lastAppliedCheckpointId: null,
  lastSelfInjectionMessageId: null,
  extraction: createExtraction(),
  expansion: createExpansion(),
  memory: createMemory(),
  pacing: defaultPacingSettings(),
  tension: defaultTension(),
  copilot: createCopilot(),
  lastSessionAt: null,
  updatedAt: new Date().toISOString(),
});

const sanitizeExtraction = (value: RuntimeExtras | undefined): ExtractionRuntimeState => {
  const existing = value?.extraction;
  if (!existing) return createExtraction();
  return {
    settings: { ...defaultExtractionSettings(), ...existing.settings },
    audits: Array.isArray(existing.audits) ? existing.audits.slice(-20) : [],
    reconciliationEvents: Array.isArray(existing.reconciliationEvents) ? existing.reconciliationEvents.slice(-50) : [],
    lastReadBoundary: typeof existing.lastReadBoundary === "number" ? existing.lastReadBoundary : 0,
    scheduler: existing.scheduler ?? { queueDepth: 0, inFlight: false, lastError: null },
  };
};

const sanitizeExpansion = (value: RuntimeExtras | undefined): ExpansionRuntimeState => {
  const existing = value?.expansion;
  if (!existing) return createExpansion();
  return {
    entries: existing.entries && typeof existing.entries === "object" ? existing.entries : {},
    scheduler: existing.scheduler ?? { queueDepth: 0, inFlight: false, lastError: null },
  };
};

const expansionKey = (candidate: Pick<StubExpansionCandidate, "sourceCheckpointId" | "stubId" | "targetAnchorId">) => `${candidate.sourceCheckpointId}->${candidate.stubId}->${candidate.targetAnchorId}`;

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
  private pendingTension: TensionRuntimeState | null = null;
  private sceneDetectCursor: { location: string | null; cast: string | null } | null = null;
  private consolidationInFlight = false;
  private stagedPrivate = new Map<string, { facts: string; epistemic: string }>();
  private canonInFlight = false;
  private activeNudge: string | null = null;
  private pendingAwayRecap: AwayRecap | null = null;
  private payloadCaptures: PayloadCapture[] = [];

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  notify() {
    this.listeners.forEach((listener) => listener());
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

  async loadSelectedFromChat() {
    const hash = getSelectedStoryHash();
    if (!hash) {
      this.loaded = null;
      this.extras = createExtras();
      this.pendingTension = null;
      clearStoryExtensionPrompt(PACING_HINT_EXTENSION_KEY);
      clearAllMemoryInjection();
      this.status = "No story selected for this chat";
      this.notify();
      return;
    }
    await this.selectStory(hash, "hydrate");
    void this.showAwayRecap();
  }

  async importStory(rawText: string) {
    let raw: unknown;
    try {
      raw = JSON.parse(rawText);
    } catch (error) {
      this.validationErrors = [{ path: "$", message: error instanceof Error ? error.message : "Invalid JSON" }];
      this.status = "Import failed";
      this.notify();
      return false;
    }

    const saved = saveStoryRecord(raw);
    if (isValidationErrorList(saved)) {
      this.validationErrors = saved;
      this.status = "Story validation failed";
      this.notify();
      return false;
    }

    await this.loadStory(saved, "activate");
    return true;
  }

  async selectStory(hash: string, mode: "activate" | "hydrate" = "activate") {
    const record = findStoryRecord(hash);
    if (!record) {
      this.validationErrors = [{ path: "story", message: `Unknown story '${hash}'` }];
      this.status = "Story not found";
      this.notify();
      return false;
    }
    const loaded = loadStoryRecord(record);
    if (isValidationErrorList(loaded)) {
      this.validationErrors = loaded;
      this.status = "Story validation failed";
      this.notify();
      return false;
    }
    await this.loadStory(loaded, mode);
    return true;
  }

  async commitBoundary() {
    if (!this.loaded) return null;
    this.refreshRequirements();
    this.revalidateInsertedExpansions();
    const pendingBridges = this.pendingBridgeArcs();
    this.enqueuePendingArcBridges(pendingBridges);
    const result = this.engine.commitBoundary(this.getBoundaryContext());
    if (pendingBridges.length) {
      const applied = new Set(pendingBridges.map((arc) => arc.id));
      this.extras.memory = { ...this.extras.memory, arcs: this.extras.memory.arcs.map((arc) => (applied.has(arc.id) ? { ...arc, bridgeApplied: true } : arc)) };
    }
    if (result.effects) {
      await this.effects.applyCheckpoint(this.loaded.story, this.engine.activeCheckpoint, this.extras, this.getSnapshot(), "activate");
    } else if (this.extras.requirements.ready && this.extras.lastAppliedCheckpointId !== this.engine.activeCheckpoint.id) {
      await this.effects.applyCheckpoint(this.loaded.story, this.engine.activeCheckpoint, this.extras, this.getSnapshot(), "hydrate");
    }
    this.applyCommittedTension(result);
    this.revalidateInsertedExpansions();
    this.pendingTension = null;
    this.updateSteering();
    this.updateMemoryInjection();
    await this.persist();
    this.status = result.fired ? `Advanced to ${result.activeCheckpointId}` : `Committed boundary ${result.boundary}`;
    this.boundaryListeners.forEach((listener) => listener(result));
    this.notify();
    return result;
  }

  async activateCheckpoint(id: string) {
    if (!this.loaded) return false;
    this.refreshRequirements();
    this.engine.activateCheckpoint(id, this.getBoundaryContext());
    await this.effects.applyCheckpoint(this.loaded.story, this.engine.activeCheckpoint, this.extras, this.getSnapshot(), "activate");
    this.updateSteering();
    this.updateMemoryInjection();
    await this.persist();
    this.status = `Manually activated ${id}`;
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
    const value = this.parseQualityValue(quality.type, valueText);
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
    await this.effects.fireNpcReplies(this.engine.activeCheckpoint, this.extras, "afterSpeak");
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
      const resolvedBefore = new Set(this.extras.memory.arcs.filter((arc) => arc.status === "resolved").map((arc) => arc.id));
      const rolledArcs = rollbackArcs(this.extras.memory.arcs, messageId, boundary);
      const canonStale = rolledArcs.filter((arc) => arc.status === "resolved" && resolvedBefore.has(arc.id)).length !== resolvedBefore.size;
      this.extras.memory = { ...this.extras.memory, ...dropByMessageId(this.extras.memory, messageId), arcs: rolledArcs, epistemic: rollbackEpistemic(this.extras.memory.epistemic, messageId), ledger: rollbackLedger(this.extras.memory.ledger, messageId), ...(canonStale ? { canon: null } : {}) };
      this.extras.extraction.audits = this.extras.extraction.audits.filter((audit) => audit.window.to < messageId);
      this.extras.tension = this.replayCommittedTension();
      this.pendingTension = null;
      this.refreshRequirements();
      await this.effects.applyCheckpoint(this.loaded.story, this.engine.activeCheckpoint, this.extras, this.getSnapshot(), "hydrate");
      this.updateSteering();
      this.updateMemoryInjection();
      await this.persist();
      this.status = `Rolled back to boundary ${boundary}`;
      this.rollbackListeners.forEach((listener) => listener(messageId, window));
      this.notify();
    }
  }

  private ledgerBindings(): LedgerBinding[] {
    if (!this.loaded) return [];
    return Object.values(this.loaded.story.qualityByKey)
      .filter((quality) => quality.ledger_binding)
      .map((quality) => ({ entity: quality.ledger_binding!.entity, field: quality.ledger_binding!.field, qualityKey: quality.key }));
  }

  getStory(): NormalizedStoryV2 | null {
    return this.loaded?.story ?? null;
  }

  getEngineState(): EngineState | null {
    return this.loaded ? this.engine.serialize() : null;
  }

  getExtractionSettings(): ExtractionRuntimeSettings {
    return this.extras.extraction.settings;
  }

  setExtractionSettings(settings: Partial<ExtractionRuntimeSettings>) {
    this.extras.extraction.settings = { ...this.extras.extraction.settings, ...settings };
    void this.persist();
    this.notify();
  }

  setPacingSettings(settings: Partial<PacingSettings>) {
    this.extras.pacing = sanitizePacing({ ...this.extras.pacing, ...settings });
    this.updateSteering();
    void this.persist();
    this.notify();
  }

  setMemorySettings(settings: Partial<MemoryRuntimeSettings>) {
    this.extras.memory = { ...this.extras.memory, settings: { ...this.extras.memory.settings, ...settings } };
    this.updateMemoryInjection();
    void this.persist();
    this.notify();
  }

  getCopilotSettings(): CopilotRuntimeSettings {
    return this.extras.copilot;
  }

  setCopilotSettings(settings: Partial<CopilotRuntimeSettings>) {
    this.extras.copilot = { ...this.extras.copilot, ...settings };
    if (!this.extras.copilot.enabled) this.clearCopilotNudge();
    void this.persist();
    this.notify();
  }

  private copilotClient(debugResponse?: string): { profileId: string | null; debugResponse: string | null } {
    return { profileId: this.getExtractionSettings().profileId, debugResponse: debugResponse ?? globalThis.storyOrchestratorDebugCopilotResponse ?? null };
  }

  async runCopilotStage(input: { draft: StoryV2; stage: CopilotStage; message: string; history: CopilotMessage[] }, debugResponse?: string): Promise<ProposalResult> {
    return runAuthoringStage(input, this.copilotClient(debugResponse));
  }

  getDriverContext(): DriverContext | null {
    if (!this.loaded) return null;
    const story = this.loaded.story;
    const state = this.engine.serialize();
    const blackboard = new Blackboard(story, state.blackboard);
    const active = story.checkpointById[state.activeCheckpointId] ?? null;
    const outgoing = story.outgoingByCheckpoint[state.activeCheckpointId] ?? [];
    const unmetGates = outgoing
      .filter((transition) => !evaluateGate(transition.gate, blackboard))
      .map((transition) => `${renderGateText(transition.gate)} → ${transition.to}`)
      .filter((text) => text.length > 0);
    const upcomingAnchors = this.buildConvergenceReadout()
      .filter((entry) => !entry.reached)
      .map((entry) => ({ id: entry.anchorId, name: entry.anchorName, progress: entry.progress, threshold: entry.threshold }));
    return {
      title: story.title,
      activeCheckpointId: active?.id ?? null,
      activeObjective: active?.objective ?? "",
      unmetGates,
      upcomingAnchors,
      blackboard: state.blackboard.values,
      canon: this.getCanon(),
      recentChat: getLastMessageText(),
    };
  }

  async runCopilotSuggest(debugResponse?: string): Promise<Suggestion[]> {
    const context = this.getDriverContext();
    if (!context) return [];
    return runDriverSuggest(context, this.copilotClient(debugResponse));
  }

  async runCopilotReport(debugResponse?: string): Promise<string> {
    const context = this.getDriverContext();
    if (!context) return "";
    return runDriverReport(context, this.copilotClient(debugResponse));
  }

  setCopilotNudge(text: string, depth = 1) {
    const trimmed = text.trim();
    if (!trimmed || !this.extras.copilot.enabled) return;
    setStoryExtensionPrompt(COPILOT_NUDGE_KEY, trimmed, depth);
    this.activeNudge = trimmed;
    this.notify();
  }

  clearCopilotNudge() {
    if (this.activeNudge === null) return;
    clearStoryExtensionPrompt(COPILOT_NUDGE_KEY);
    this.activeNudge = null;
    this.notify();
  }

  getActiveNudge(): string | null {
    return this.activeNudge;
  }

  getExtractionFacts(): ParsedFact[] {
    return this.extras.memory.entries
      .filter((entry) => entry.tier === "facts")
      .map((entry) => ({ text: entry.text, evidence: entry.evidence, importance: entry.importance, boundary: entry.createdAt, messageId: entry.messageId }));
  }

  getFiredTransitions(): NormalizedTransition[] {
    return this.engine.stateLog.map((entry) => entry.fired).filter((transition): transition is NormalizedTransition => Boolean(transition));
  }

  getExpansionGateSources() {
    return collectExpansionGateSources(this.extras.expansion.entries);
  }

  recordReconciliation(descriptor: { checkpointId: string; boundary: number; targetedKeys: string[] }) {
    const id = `${descriptor.boundary}:${descriptor.targetedKeys.join(",")}`;
    const event = { id, boundary: descriptor.boundary, checkpointId: descriptor.checkpointId, targetedKeys: descriptor.targetedKeys, scheduledAt: new Date().toISOString(), resolvedAt: null, evidence: [] };
    this.extras.extraction.reconciliationEvents = [...this.extras.extraction.reconciliationEvents, event].slice(-50);
    void this.persist();
    this.notify();
  }

  setSchedulerSnapshot(snapshot: ExtractionRuntimeState["scheduler"]) {
    const extended = snapshot as unknown as { heavyQueueDepth?: number; heavyInFlight?: boolean; lastHeavyError?: string | null };
    this.extras.extraction.scheduler = snapshot;
    this.extras.expansion.scheduler = {
      queueDepth: typeof extended.heavyQueueDepth === "number" ? extended.heavyQueueDepth : this.extras.expansion.scheduler.queueDepth,
      inFlight: Boolean(extended.heavyInFlight),
      lastError: typeof extended.lastHeavyError === "string" ? extended.lastHeavyError : null,
    };
    void this.persist();
    this.notify();
  }

  pauseExtraction(message: string) {
    this.extras.extraction.settings.enabled = false;
    this.extras.extraction.scheduler = { ...this.extras.extraction.scheduler, lastError: message };
    this.status = `Extraction paused: ${message}`;
    void this.persist();
    this.notify();
  }

  private enqueueExtractorDeltas(acceptedDeltas: ParsedDelta[], window: { from: number; to: number }) {
    if (!acceptedDeltas.length) return;
    const versions = this.engine.serialize().blackboard.versions;
    const blackboardVersionSum = Object.values(versions).reduce((sum, version) => sum + version, 0);
    const tensionLevels: TensionLevel[] = [];
    acceptedDeltas.forEach((entry) => {
      if (entry.delta.q !== TENSION_CURRENT_KEY || !entry.rawLevel) return;
      const base = this.pendingTension ?? this.extras.tension;
      const smoothed = updateEma(base.smoothed, entry.delta.v as number, this.extras.pacing.alpha);
      this.pendingTension = { levels: [...base.levels, entry.rawLevel].slice(-50), smoothed };
      tensionLevels.push(entry.rawLevel);
      entry.delta.v = smoothed;
    });
    this.engine.enqueue({
      source: "extractor",
      blackboardVersionSum,
      turnRange: window,
      deltas: acceptedDeltas.map((entry) => entry.delta),
      ...(tensionLevels.length ? { tensionLevels } : {}),
    });
  }

  async applyExtractionAudit(audit: SharedReadAudit, facts: ParsedFact[], memoryLines: ParsedMemoryLine[] = [], arcSignals: ParsedArcSignal[] = [], epistemicSignals: ParsedEpistemicSignal[] = [], ledgerSignals: ParsedLedgerSignal[] = []) {
    if (!this.loaded) return;
    const state = this.engine.serialize();
    this.enqueueExtractorDeltas(audit.acceptedDeltas, audit.window);
    const newMemoryEntries: MemoryEntry[] = [
      ...facts.map((fact): MemoryEntry => ({
        id: generateMemoryId(),
        tier: "facts",
        text: fact.text,
        type: "fact",
        importance: fact.importance,
        expiration: "permanent",
        entities: [],
        confidence: 1,
        activationTriggers: [],
        evidence: fact.evidence,
        createdAt: state.boundary,
        messageId: audit.window.to,
        recallCount: 0,
      })),
      ...memoryLines.map((line): MemoryEntry => ({
        id: generateMemoryId(),
        tier: line.tier,
        text: line.text,
        type: line.type,
        importance: line.importance,
        expiration: line.expiration,
        entities: line.entities,
        confidence: 1,
        activationTriggers: [],
        evidence: line.evidence,
        characterId: line.characterId,
        createdAt: state.boundary,
        messageId: audit.window.to,
        recallCount: 0,
      })),
    ];
    const memoryEnabled = this.extras.memory.settings.enabled;
    if (memoryEnabled && newMemoryEntries.length) {
      await this.computeEntryTokens(newMemoryEntries);
      const written = addMemoryEntries(this.extras.memory, newMemoryEntries, audit.window);
      const capped = capAllTiers(written.state, this.extras.memory.settings.tierBudgets);
      this.extras.memory = { ...this.extras.memory, ...capped, updatedAt: new Date().toISOString() };
    }
    let resolvedArcs: ArcEntry[] = [];
    if (memoryEnabled && arcSignals.length) {
      const applied = applyArcSignals(this.extras.memory.arcs, arcSignals, { boundary: state.boundary, messageId: audit.window.to });
      this.extras.memory = { ...this.extras.memory, arcs: capOpenArcs(capResolvedArcs(applied.arcs)), updatedAt: new Date().toISOString() };
      resolvedArcs = applied.resolved;
    }
    const capable = memoryEnabled && this.extras.memory.settings.epistemicLedgerCapable;
    if (capable && epistemicSignals.length) {
      const applied = applyEpistemicSignals(this.extras.memory.epistemic, epistemicSignals, { boundary: state.boundary, messageId: audit.window.to });
      this.extras.memory = { ...this.extras.memory, epistemic: capEpistemic(applied.entries), updatedAt: new Date().toISOString() };
    }
    if (capable && ledgerSignals.length) {
      const applied = applyLedgerSignals(this.extras.memory.ledger, ledgerSignals, buildBoundKeySet(this.ledgerBindings()), { boundary: state.boundary, messageId: audit.window.to });
      this.extras.memory = { ...this.extras.memory, ledger: capLedger(applied), updatedAt: new Date().toISOString() };
    }
    this.extras.extraction.audits = [...this.extras.extraction.audits, audit].slice(-20);
    if (audit.reason.startsWith("reconcile:")) {
      const evidence = audit.acceptedDeltas.map((entry) => `${entry.delta.q}=${String(entry.delta.v)} (${entry.evidence})`);
      const events = [...this.extras.extraction.reconciliationEvents];
      for (let index = 0; index < events.length; index += 1) {
        if (events[index].resolvedAt === null) {
          events[index] = { ...events[index], resolvedAt: new Date().toISOString(), evidence: [...events[index].evidence, ...evidence] };
          break;
        }
      }
      this.extras.extraction.reconciliationEvents = events;
    }
    this.extras.extraction.lastReadBoundary = state.boundary;
    if (memoryEnabled && (newMemoryEntries.length || arcSignals.length || epistemicSignals.length || ledgerSignals.length)) this.updateMemoryInjection();
    if (resolvedArcs.length) this.onArcsResolved(resolvedArcs);
    await this.persist();
    this.notify();
    if (memoryEnabled && audit.sceneBreak) this.sceneBreakListeners.forEach((listener) => listener(audit));
  }

  private onArcsResolved(resolved: ArcEntry[]): void {
    if (!this.loaded || !resolved.length) return;
    this.arcResolvedListeners.forEach((listener) => listener(resolved.map((arc) => arc.id)));
  }

  private pendingBridgeArcs(): ArcEntry[] {
    if (!this.loaded) return [];
    const bridges = this.loaded.story.arc_bridges ?? [];
    if (!bridges.length) return [];
    return this.extras.memory.arcs.filter((arc) => arc.status === "resolved" && !arc.bridgeApplied && matchArcBridges(bridges, [arc]).size > 0);
  }

  private enqueuePendingArcBridges(pending: ArcEntry[]): void {
    if (!this.loaded || !pending.length) return;
    const increments = matchArcBridges(this.loaded.story.arc_bridges ?? [], pending);
    if (!increments.size) return;
    const values = this.engine.serialize().blackboard.values;
    const deltas: BlackboardDelta[] = [];
    increments.forEach((amount, anchor) => {
      const key = progressQualityForAnchor(anchor);
      const current = typeof values[key] === "number" ? (values[key] as number) : 0;
      deltas.push({ q: key, v: current + amount, source: "code" });
    });
    this.engine.enqueue({ source: "mechanical", blackboardVersionSum: 0, deltas });
  }

  async runArcSummaryPass(arcIds: string[]): Promise<boolean> {
    if (!this.loaded || !this.extras.memory.settings.enabled || !arcIds.length) return false;
    const settings = this.getExtractionSettings();
    const sceneSummaries = this.extras.memory.entries
      .filter((entry) => entry.tier === "scene_history")
      .slice(-5)
      .map((entry, index) => `Scene ${index + 1}: ${entry.text}`)
      .join("\n");
    const memories = this.highImportanceFacts(20).map((entry) => `[${entry.type}] ${entry.text}`).join("\n");
    let changed = false;
    for (const id of arcIds) {
      const arc = this.extras.memory.arcs.find((candidate) => candidate.id === id);
      if (!arc || arc.status !== "resolved" || arc.summary) continue;
      const summary = await callExtractionModel(buildArcSummaryPrompt(arc.text, sceneSummaries, memories), {
        profileId: settings.profileId,
        debugResponse: globalThis.storyOrchestratorDebugArcSummaryResponse ?? null,
      });
      const trimmed = stripChannelNoise(summary);
      if (!trimmed) continue;
      this.extras.memory = { ...this.extras.memory, arcs: setArcSummary(this.extras.memory.arcs, id, trimmed), updatedAt: new Date().toISOString() };
      changed = true;
    }
    if (changed) {
      await this.regenerateCanon();
      await this.persist();
      this.notify();
    }
    return changed;
  }

  detectSceneBreak() {
    if (!this.loaded || !this.extras.memory.settings.enabled) return null;
    const text = getLastMessageText();
    if (!text) return null;
    const location = this.engine.serialize().blackboard.values.location;
    const locationValue = typeof location === "string" ? location : null;
    const group = getActiveGroup();
    const cast = group ? group.members.filter((member) => !(group.disabled_members ?? []).includes(member)).sort().join(",") : null;

    const cursor = this.sceneDetectCursor;
    const locationChanged = Boolean(cursor && cursor.location !== null && locationValue !== null && cursor.location !== locationValue);
    const castChanged = Boolean(cursor && cursor.cast !== null && cast !== null && cursor.cast !== cast);
    this.sceneDetectCursor = { location: locationValue, cast };

    return detectSceneBreakHeuristic(text, locationChanged, castChanged);
  }

  async runSceneBreakPass(audit: SharedReadAudit) {
    if (!this.loaded || !audit.sceneBreak || !this.extras.memory.settings.enabled) return;
    const settings = this.getExtractionSettings();
    const window = getChatWindow(audit.window.from, audit.window.to);
    const sceneText = window.messages.map((message) => `${message.speaker}: ${message.text}`).join("\n") || "(empty)";
    const summary = await callExtractionModel(buildSceneSummaryPrompt(sceneText), {
      profileId: settings.profileId,
      debugResponse: globalThis.storyOrchestratorDebugSceneSummaryResponse ?? null,
    });
    const state = this.engine.serialize();
    const summaryEntry: MemoryEntry = {
      id: generateMemoryId(),
      tier: "scene_history",
      text: stripChannelNoise(summary),
      type: "scene",
      importance: 2,
      expiration: "permanent",
      entities: [],
      confidence: 1,
      activationTriggers: [],
      evidence: sceneText,
      createdAt: state.boundary,
      messageId: audit.window.to,
      recallCount: 0,
    };
    await this.computeEntryTokens([summaryEntry]);
    const written = addMemoryEntries(this.extras.memory, [summaryEntry], audit.window);
    const capped = capAllTiers(expireScoped(written.state, "scene"), this.extras.memory.settings.tierBudgets);
    const sceneOccurrence = this.extras.memory.sceneCount + 1;
    this.extras.memory = { ...this.extras.memory, ...capped, sceneCount: sceneOccurrence, updatedAt: new Date().toISOString() };
    this.updateMemoryInjection();
    await this.effects.fireNpcReplies(this.engine.activeCheckpoint, this.extras, "sceneBreak", sceneOccurrence);
    await this.persist();
    this.notify();
    await this.syncWorldInfo();
  }

  shouldCompactShortTerm(lastMessageId: number): boolean {
    if (!this.loaded || !this.extras.memory.settings.enabled) return false;
    return lastMessageId - this.extras.memory.shortTermSummaryEnd >= SHORT_TERM_COMPACTION_MESSAGES;
  }

  async runShortTermCompaction() {
    if (!this.loaded || !this.extras.memory.settings.enabled) return;
    const lastId = (Array.isArray(getContext().chat) ? getContext().chat.length : 0) - 1;
    if (!this.shouldCompactShortTerm(lastId)) return;
    const window = getChatWindow(this.extras.memory.shortTermSummaryEnd + 1, lastId);
    const recentText = window.messages.map((message) => `${message.speaker}: ${message.text}`).join("\n");
    if (!recentText) return;
    const previous = this.extras.memory.entries.find((entry) => entry.tier === "short_term");
    if (previous?.pinned) return;
    const settings = this.getExtractionSettings();
    const summary = stripChannelNoise(await callExtractionModel(buildShortTermSummaryPrompt(previous?.text ?? null, recentText), {
      profileId: settings.profileId,
      debugResponse: globalThis.storyOrchestratorDebugShortTermResponse ?? null,
    }));
    if (!summary) return;
    const state = this.engine.serialize();
    const entry: MemoryEntry = {
      id: generateMemoryId(),
      tier: "short_term",
      text: summary,
      type: "scene",
      importance: 2,
      expiration: "session",
      entities: [],
      confidence: 1,
      activationTriggers: [],
      evidence: recentText,
      createdAt: state.boundary,
      messageId: window.to,
      recallCount: 0,
    };
    await this.computeEntryTokens([entry]);
    const entries = [...this.extras.memory.entries.filter((candidate) => candidate.tier !== "short_term"), entry];
    this.extras.memory = { ...this.extras.memory, entries, shortTermSummaryEnd: window.to, updatedAt: new Date().toISOString() };
    this.updateMemoryInjection();
    await this.persist();
    this.notify();
  }

  private enabledCharacterNames(): string[] {
    if (!this.loaded) return [];
    const enabled = new Set(this.getEnabledCharacterIds());
    const names = this.loaded.story.roster.filter((member) => enabled.has(member.id)).map((member) => member.name ?? member.id);
    return names.length ? names : this.loaded.story.roster.map((member) => member.name ?? member.id);
  }

  private ledgerEntityList(): Array<{ name: string; type: string }> {
    if (!this.loaded) return [];
    const types = new Map<string, string>();
    for (const member of this.loaded.story.roster) types.set(member.name ?? member.id, "character");
    for (const binding of this.ledgerBindings()) if (!types.has(binding.entity)) types.set(binding.entity, "character");
    for (const entry of this.extras.memory.ledger) types.set(entry.entity, entry.entityType);
    return [...types].map(([name, type]) => ({ name, type }));
  }

  async runEpistemicLedgerPass(audit: SharedReadAudit): Promise<boolean> {
    if (!this.loaded || !audit.sceneBreak || !this.getEpistemicLedgerCapable()) return false;
    const settings = this.getExtractionSettings();
    const window = getChatWindow(audit.window.from, audit.window.to);
    const sceneText = window.messages.map((message) => `${message.speaker}: ${message.text}`).join("\n") || "(empty)";
    const state = this.engine.serialize();
    const participants = this.enabledCharacterNames();

    const existing = activeEpistemic(this.extras.memory.epistemic);
    const epistemicResponse = await callExtractionModel(buildEpistemicPassPrompt(sceneText, participants, existing.map((entry) => ({ tag: entry.tag, subject: entry.subject, content: entry.content, hiddenFrom: entry.hiddenFrom }))), {
      profileId: settings.profileId,
      debugResponse: globalThis.storyOrchestratorDebugEpistemicResponse ?? null,
    });
    const epistemicSignals: ParsedEpistemicSignal[] = [];
    const retireIndices = new Set<number>();
    for (const line of stripChannelNoise(epistemicResponse).split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.toUpperCase() === "NONE") continue;
      parseEpistemicRetire(trimmed).forEach((index) => retireIndices.add(index));
      const signal = parseEpistemicLine(trimmed);
      if (signal) epistemicSignals.push(signal);
    }
    const retireIds = [...retireIndices].map((index) => existing[index - 1]?.id).filter((id): id is string => Boolean(id));
    const appliedEpistemic = applyEpistemicSignals(this.extras.memory.epistemic, epistemicSignals, { boundary: state.boundary, messageId: audit.window.to }, retireIds);

    const ledgerResponse = await callExtractionModel(buildLedgerPassPrompt(sceneText, this.ledgerEntityList()), {
      profileId: settings.profileId,
      debugResponse: globalThis.storyOrchestratorDebugLedgerResponse ?? null,
    });
    const ledgerSignals: ParsedLedgerSignal[] = [];
    for (const line of stripChannelNoise(ledgerResponse).split(/\r?\n/)) ledgerSignals.push(...parseLedgerLine(line.trim()));
    const appliedLedger = applyLedgerSignals(this.extras.memory.ledger, ledgerSignals, buildBoundKeySet(this.ledgerBindings()), { boundary: state.boundary, messageId: audit.window.to });

    this.extras.memory = { ...this.extras.memory, epistemic: capEpistemic(appliedEpistemic.entries), ledger: capLedger(appliedLedger), updatedAt: new Date().toISOString() };
    this.updateMemoryInjection();
    await this.persist();
    this.notify();
    return epistemicSignals.length > 0 || ledgerSignals.length > 0 || retireIds.length > 0;
  }

  async runExtractionNow(debugResponse?: string, reason = "manual") {
    if (!this.loaded) return false;
    const settings = this.getExtractionSettings();
    const result = await runSharedRead({
      story: this.loaded.story,
      state: this.engine.serialize(),
      priority: 0,
      reason,
      facts: this.getExtractionFacts(),
      firedTransitions: this.getFiredTransitions(),
      extraGateSources: this.getExpansionGateSources(),
      openArcs: this.getOpenArcs(),
      epistemicLedgerCapable: this.getEpistemicLedgerCapable(),
      entities: this.getEntities(),
      client: { ...settings, debugResponse: debugResponse ?? globalThis.storyOrchestratorDebugExtractionResponse ?? null },
    });
    await this.applyExtractionAudit(result.audit, result.facts, result.memory, result.arcs, result.epistemic, result.ledger);
    await this.commitBoundary();
    return true;
  }

  async runMemorizeBacklog(windowSize = 8): Promise<boolean> {
    if (!this.loaded || !this.extras.memory.settings.enabled || this.extras.memory.backfill?.running) return false;
    const chat = Array.isArray(getContext().chat) ? getContext().chat : [];
    const totalWindows = Math.max(1, Math.ceil(chat.length / windowSize));
    const total = totalWindows + 1;
    this.extras.memory.backfill = { running: true, processed: 0, total, lastError: null };
    await this.persist();
    this.notify();
    try {
      const settings = this.getExtractionSettings();
      const client = { ...settings, debugResponse: globalThis.storyOrchestratorDebugExtractionResponse ?? null };
      for (let from = 0; from < chat.length; from += windowSize) {
        const to = Math.min(chat.length - 1, from + windowSize - 1);
        const state = this.engine.serialize();
        const result = await runSharedRead({
          story: this.loaded.story,
          state,
          priority: 0,
          reason: "memorize:window",
          window: getChatWindow(from, to),
          scope: deriveFullScope(this.loaded.story, state.blackboard),
          firedTransitions: this.getFiredTransitions(),
          facts: this.getExtractionFacts(),
          openArcs: this.getOpenArcs(),
          epistemicLedgerCapable: this.getEpistemicLedgerCapable(),
          entities: this.getEntities(),
          client,
        });
        await this.applyExtractionAudit({ ...result.audit, acceptedDeltas: [] }, result.facts, result.memory, result.arcs, result.epistemic, result.ledger);
        const progress = this.extras.memory.backfill as MemoryBackfillState;
        this.extras.memory.backfill = { ...progress, processed: progress.processed + 1 };
        await this.persist();
        this.notify();
      }

      const finalState = this.engine.serialize();
      const fullResult = await runSharedRead({
        story: this.loaded.story,
        state: finalState,
        priority: 0,
        reason: "memorize:full",
        window: getChatWindow(0, Math.max(0, chat.length - 1)),
        scope: deriveFullScope(this.loaded.story, finalState.blackboard),
        firedTransitions: this.getFiredTransitions(),
        facts: this.getExtractionFacts(),
        client,
      });
      await this.applyExtractionAudit(fullResult.audit, [], []);
      await this.commitBoundary();

      this.extras.memory.backfill = { running: false, processed: total, total, lastError: null };
      this.status = "Memorize backlog complete";
      await this.persist();
      this.notify();
      return true;
    } catch (error) {
      const progress = this.extras.memory.backfill as MemoryBackfillState;
      this.extras.memory.backfill = { ...progress, running: false, lastError: error instanceof Error ? error.message : "Memorize backlog failed" };
      this.status = "Memorize backlog failed";
      await this.persist();
      this.notify();
      return false;
    }
  }

  async setMemoryPinned(id: string, pinned: boolean) {
    this.extras.memory = { ...this.extras.memory, ...setPinned(this.extras.memory, id, pinned) };
    this.updateMemoryInjection();
    await this.persist();
    this.notify();
  }

  async excludeMemoryEntry(id: string) {
    this.extras.memory = { ...this.extras.memory, ...excludeEntry(this.extras.memory, id) };
    this.updateMemoryInjection();
    await this.persist();
    this.notify();
  }

  async editMemoryEntry(id: string, text: string) {
    this.extras.memory = { ...this.extras.memory, ...editEntryText(this.extras.memory, id, text) };
    this.updateMemoryInjection();
    await this.persist();
    this.notify();
  }

  getArcs(): ArcEntry[] {
    return this.extras.memory.arcs;
  }

  getOpenArcs(): string[] {
    return this.loaded && this.extras.memory.settings.enabled ? openArcTexts(this.extras.memory.arcs, ARC_OPEN_INJECT_LIMIT) : [];
  }

  getEpistemicLedgerCapable(): boolean {
    return this.extras.memory.settings.enabled && this.extras.memory.settings.epistemicLedgerCapable;
  }

  getEntities(): string[] {
    if (!this.loaded) return [];
    const names = new Set<string>();
    for (const member of this.loaded.story.roster) names.add(member.name ?? member.id);
    for (const binding of this.ledgerBindings()) names.add(binding.entity);
    for (const entry of this.extras.memory.ledger) names.add(entry.entity);
    return [...names].filter(Boolean);
  }

  async setArcPinned(id: string, pinned: boolean) {
    this.extras.memory = { ...this.extras.memory, arcs: setArcPinned(this.extras.memory.arcs, id, pinned) };
    this.updateMemoryInjection();
    await this.persist();
    this.notify();
  }

  async removeArc(id: string) {
    this.extras.memory = { ...this.extras.memory, arcs: removeArc(this.extras.memory.arcs, id) };
    this.updateMemoryInjection();
    await this.persist();
    this.notify();
  }

  getCanon(): string {
    const canon = this.extras.memory.canon;
    if (canon?.text) return canon.text;
    if (!this.loaded) return "";
    const state = this.engine.serialize();
    return getCanonLite(this.loaded.story, state.visitedAnchors, this.getFiredTransitions(), this.getExtractionFacts());
  }

  getPossibleTransitions(): string[] {
    if (!this.loaded) return [];
    const story = this.loaded.story;
    const state = this.engine.serialize();
    return (story.outgoingByCheckpoint[state.activeCheckpointId] ?? []).map((transition) => {
      const toName = story.checkpointById[transition.to]?.name ?? transition.to;
      const gateText = renderGateText(transition.gate).trim();
      return `→ ${toName}${gateText ? ` when ${gateText}` : ""}`;
    });
  }

  private highImportanceFacts(limit: number): MemoryEntry[] {
    return this.extras.memory.entries
      .filter((entry) => entry.tier === "facts" && !entry.supersededBy && !entry.foldedInto && entry.importance >= 2)
      .slice(0, limit);
  }

  private canonInputs(): { arcSummaries: string[]; facts: string[] } {
    const arcSummaries = resolvedArcs(this.extras.memory.arcs)
      .map((arc) => arc.summary)
      .filter((summary): summary is string => Boolean(summary));
    return { arcSummaries, facts: this.highImportanceFacts(30).map((entry) => entry.text) };
  }

  async regenerateCanon(force = false): Promise<boolean> {
    if (!this.loaded || !this.extras.memory.settings.enabled || this.canonInFlight) return false;
    const { arcSummaries, facts } = this.canonInputs();
    if (!arcSummaries.length) return false;
    const inputHash = canonInputHash(arcSummaries, facts);
    if (!force && this.extras.memory.canon?.inputHash === inputHash) return false;
    this.canonInFlight = true;
    try {
      const settings = this.getExtractionSettings();
      const text = await callExtractionModel(buildCanonSummaryPrompt(this.loaded.story.title, arcSummaries, facts), {
        profileId: settings.profileId,
        debugResponse: globalThis.storyOrchestratorDebugCanonResponse ?? null,
      });
      const trimmed = stripChannelNoise(text);
      if (!trimmed) return false;
      this.extras.memory = { ...this.extras.memory, canon: { text: trimmed, inputHash, updatedAt: new Date().toISOString() }, updatedAt: new Date().toISOString() };
      await this.persist();
      this.notify();
      return true;
    } finally {
      this.canonInFlight = false;
    }
  }

  scheduleExpansionForActive(schedule: (reason: string, run: () => Promise<void>) => void) {
    if (!this.loaded) return false;
    const candidate = findStubExpansionCandidate(this.loaded.story, this.engine.serialize().activeCheckpointId);
    if (!candidate) return false;
    const key = expansionKey(candidate);
    const existing = this.extras.expansion.entries[key];
    if (existing) return false;
    this.extras.expansion.entries[key] = this.createEmptyExpansionEntry(candidate, "queued");
    void this.persist();
    this.notify();
    schedule(`expand:${candidate.stubId}`, () => this.generateExpansion(candidate));
    return true;
  }

  async runExpansionNow(debugResponse?: string) {
    if (!this.loaded) return false;
    const candidate = findStubExpansionCandidate(this.loaded.story, this.engine.serialize().activeCheckpointId);
    if (!candidate) {
      this.status = "No reachable stub from active checkpoint";
      this.notify();
      return false;
    }
    await this.generateExpansion(candidate, debugResponse ?? globalThis.storyOrchestratorDebugGenerationResponse ?? null);
    return true;
  }

  getSnapshot(): RuntimeSnapshot {
    const state = this.loaded ? this.engine.serialize() : null;
    const story = this.loaded?.story ?? null;
    const active = state && story ? story.checkpointById[state.activeCheckpointId] : null;
    const blackboard = state?.blackboard.values ?? {};
    const evidenceByKey = new Map<string, string>();
    this.extras.extraction.audits.forEach((audit) => {
      audit.acceptedDeltas.forEach((entry) => evidenceByKey.set(entry.delta.q, entry.evidence));
    });
    const blackboardMeta = Object.fromEntries(Object.keys(blackboard).map((key) => [key, {
      version: state?.blackboard.versions[key] ?? 0,
      latched: state?.blackboard.latched[key] ?? false,
      source: story?.qualityByKey[key]?.source ?? "unknown",
      evidence: evidenceByKey.get(key),
    }]));

    return {
      ready: Boolean(this.loaded),
      storyHash: this.loaded?.record.hash ?? null,
      storyTitle: this.loaded?.story.title ?? null,
      storyDescription: this.loaded?.story.description ?? null,
      activeCheckpointId: active?.id ?? null,
      activeCheckpointName: active?.name ?? null,
      activeObjective: active?.objective ?? null,
      boundary: state?.boundary ?? 0,
      blackboard,
      blackboardMeta,
      checkpoints: story?.checkpoints.map((checkpoint) => ({
        id: checkpoint.id,
        name: checkpoint.name,
        objective: checkpoint.objective,
        active: checkpoint.id === active?.id,
        visited: Boolean(state?.visitedAnchors.includes(checkpoint.id)),
      })) ?? [],
      requirements: this.extras.requirements,
      validationErrors: this.validationErrors,
      library: listStoryRecords(),
      status: this.status,
      extraction: this.extras.extraction,
      expansion: this.extras.expansion,
      memory: this.extras.memory,
      pacing: this.extras.pacing,
      copilot: this.extras.copilot,
      convergence: this.buildConvergenceReadout(),
      tension: this.buildTensionSnapshot(),
      payloadCaptures: this.payloadCaptures,
    };
  }

  capturePayload(reason = "generation") {
    if (!this.loaded) return;
    const capture: PayloadCapture = {
      at: new Date().toISOString(),
      boundary: this.engine.serialize().boundary,
      reason,
      blocks: readInjectedPromptBlocks(),
    };
    this.payloadCaptures = [capture, ...this.payloadCaptures].slice(0, PAYLOAD_CAPTURE_LIMIT);
    this.notify();
  }

  getPayloadCaptures(): PayloadCapture[] {
    return this.payloadCaptures;
  }

  private buildConvergenceReadout(): ConvergenceReadout[] {
    const story = this.loaded?.story;
    const state = this.loaded ? this.engine.serialize() : null;
    if (!story || !state) return [];
    const visited = new Set(state.visitedAnchors);
    return story.checkpoints
      .filter((checkpoint) => checkpoint.type === "anchor")
      .map((anchor) => {
        const key = progressQualityForAnchor(anchor.id);
        return { anchor, hasProgress: Boolean(story.qualityByKey[key]) };
      })
      .filter((entry) => entry.hasProgress)
      .map(({ anchor }) => {
        const progressKey = progressQualityForAnchor(anchor.id);
        const raw = state.blackboard.values[progressKey];
        const progress = typeof raw === "number" ? raw : 0;
        const threshold = effectiveThresholdFor(story, anchor.id);
        return {
          anchorId: anchor.id,
          anchorName: anchor.name,
          progress,
          threshold,
          reached: visited.has(anchor.id),
        };
      });
  }

  private buildTensionSnapshot(): RuntimeSnapshot["tension"] {
    const smoothed = this.extras.tension.smoothed;
    const expected = this.loaded ? this.computeExpectedTension() : null;
    return {
      level: smoothed === null ? null : numericToLevel(smoothed),
      smoothed,
      expected,
      hint: getSteeringHint(smoothed, expected),
    };
  }

  private async loadStory(loaded: LoadedStory, mode: "activate" | "hydrate") {
    this.validationErrors = [];
    this.pendingTension = null;
    const persisted = mode === "hydrate" ? loadPersistedRuntime(loaded.record.hash) : null;
    const priorSessionAt = persisted?.extras?.lastSessionAt ?? null;
    this.extras = persisted?.extras ?? createExtras();
    this.extras.memory = sanitizeMemory(this.extras);
    this.extras.extraction = sanitizeExtraction(this.extras);
    this.extras.expansion = sanitizeExpansion(this.extras);
    this.extras.pacing = sanitizePacing(this.extras.pacing);
    this.extras.tension = sanitizeTension(this.extras.tension);
    this.extras.copilot = sanitizeCopilot(this.extras);
    this.extras.lastSelfInjectionMessageId = typeof this.extras.lastSelfInjectionMessageId === "number" ? this.extras.lastSelfInjectionMessageId : null;
    this.loaded = { record: loaded.record, story: this.mergedStoryOrBase(loaded.record.raw, loaded.story) };
    this.engine.loadStory(this.loaded.story);
    this.refreshRequirements();
    if (mode === "hydrate" && persisted?.engineState) {
      this.engine.hydrate(persisted.engineState);
      await this.effects.applyCheckpoint(loaded.story, this.engine.activeCheckpoint, this.extras, this.getSnapshot(), "hydrate");
      this.status = `Hydrated ${loaded.story.title}`;
    } else {
      await this.effects.applyCheckpoint(loaded.story, this.engine.activeCheckpoint, this.extras, this.getSnapshot(), "activate");
      this.status = `Loaded ${loaded.story.title}`;
    }
    this.updateSteering();
    this.updateMemoryInjection();
    this.detectAwayRecap(priorSessionAt);
    setSelectedStoryHash(loaded.record.hash);
    await this.persist();
    this.notify();
  }

  private detectAwayRecap(priorSessionAt: string | null) {
    if (!shouldShowAwayRecap(priorSessionAt, Date.now())) {
      this.pendingAwayRecap = null;
      return;
    }
    const snapshot = this.getSnapshot();
    this.pendingAwayRecap = buildAwayRecap({
      storyTitle: snapshot.storyTitle,
      activeCheckpointName: snapshot.activeCheckpointName,
      activeObjective: snapshot.activeObjective,
      openArcs: this.getOpenArcs(),
      canon: this.getCanon(),
      tensionLevel: snapshot.tension.level,
      gapMs: Date.now() - Date.parse(priorSessionAt as string),
    });
  }

  getAwayRecap(): AwayRecap | null {
    return this.pendingAwayRecap;
  }

  async showAwayRecap(): Promise<boolean> {
    const recap = this.pendingAwayRecap;
    if (!recap) return false;
    this.pendingAwayRecap = null;
    await showTextPopup(recap.html, { okButton: "Continue" });
    return true;
  }

  private async persist() {
    if (!this.loaded) return;
    this.extras.lastSessionAt = new Date().toISOString();
    savePersistedRuntime({
      storyHash: this.loaded.record.hash,
      storyTitle: this.loaded.story.title,
      engineState: this.engine.serialize(),
      extras: this.extras,
    });
    await getContext().saveMetadata?.();
  }

  private createEmptyExpansionEntry(candidate: StubExpansionCandidate, status: ExpansionCacheEntry["status"]): ExpansionCacheEntry {
    const state = this.engine.serialize();
    return {
      key: expansionKey(candidate),
      status,
      sourceCheckpointId: candidate.sourceCheckpointId,
      stubId: candidate.stubId,
      targetAnchorId: candidate.targetAnchorId,
      basis: { ...state.blackboard.values },
      blackboardVersionSum: Object.values(state.blackboard.versions).reduce((sum, version) => sum + version, 0),
      beats: [],
      needsReview: false,
      verdicts: [],
      codeCheck: null,
      insertedCheckpointIds: [],
      lastError: null,
      attempts: 0,
      updatedAt: new Date().toISOString(),
    };
  }

  private async generateExpansion(candidate: StubExpansionCandidate, debugResponse?: string | null) {
    if (!this.loaded) return;
    const key = expansionKey(candidate);
    const baseEntry = this.extras.expansion.entries[key] ?? this.createEmptyExpansionEntry(candidate, "generating");
    this.extras.expansion.entries[key] = { ...baseEntry, status: "generating", attempts: baseEntry.attempts + 1, updatedAt: new Date().toISOString(), lastError: null };
    this.notify();
    try {
      const state = this.engine.serialize();
      const facts = this.getExtractionFacts();
      const input = planExpansion(this.loaded.story, state.blackboard, candidate, this.getCanon(), facts.map((fact) => fact.text));
      const settings = this.getExtractionSettings();
      const generated = await generateReviewedBeats(this.loaded.story, input, { ...settings, debugResponse: debugResponse ?? globalThis.storyOrchestratorDebugGenerationResponse ?? null });
      if (generated.issues.length || !generated.codeCheck || !generated.codeCheck.ok) {
        this.extras.expansion.entries[key] = { ...this.extras.expansion.entries[key], status: "failed", beats: generated.beats, codeCheck: generated.codeCheck, lastError: generated.issues.join("; ") || generated.codeCheck?.issues.join("; ") || "Generation failed", updatedAt: new Date().toISOString() };
      } else {
        const entry: ExpansionCacheEntry = {
          ...this.extras.expansion.entries[key],
          status: generated.needsReview ? "needs_review" : "inserted",
          basis: { ...state.blackboard.values },
          blackboardVersionSum: Object.values(state.blackboard.versions).reduce((sum, version) => sum + version, 0),
          beats: generated.beats,
          needsReview: generated.needsReview,
          verdicts: [generated.verdict],
          codeCheck: generated.codeCheck,
          insertedCheckpointIds: insertedCheckpointIds({ ...this.extras.expansion.entries[key], beats: generated.beats }),
          lastError: null,
          updatedAt: new Date().toISOString(),
        };
        this.extras.expansion.entries[key] = entry;
        this.rebuildMergedStory();
      }
    } catch (error) {
      this.extras.expansion.entries[key] = { ...this.extras.expansion.entries[key], status: "failed", lastError: error instanceof Error ? error.message : "Generation failed", updatedAt: new Date().toISOString() };
    }
    await this.persist();
    this.notify();
  }

  private mergedStoryOrBase(raw: unknown, base: NormalizedStoryV2): NormalizedStoryV2 {
    try {
      return mergeExpansions(raw, this.extras.expansion.entries);
    } catch (error) {
      this.status = error instanceof Error ? `Expansion merge failed: ${error.message}` : "Expansion merge failed";
      return base;
    }
  }

  private rebuildMergedStory() {
    if (!this.loaded) return;
    const state = this.engine.serialize();
    const story = mergeExpansions(this.loaded.record.raw, this.extras.expansion.entries);
    this.loaded = { ...this.loaded, story };
    this.engine.loadStory(story);
    this.engine.hydrate(state);
  }

  private revalidateInsertedExpansions() {
    if (!this.loaded) return;
    const story = this.loaded.story;
    let changed = false;
    const state = this.engine.serialize();
    const values = state.blackboard.values;
    Object.entries(this.extras.expansion.entries).forEach(([key, entry]) => {
      if (!["inserted", "cached", "needs_review"].includes(entry.status)) return;
      if (entry.insertedCheckpointIds.includes(state.activeCheckpointId)) return;
      const verdict = revalidateExpansion(story, entry, values);
      if (verdict.status === "pass") return;
      this.extras.expansion.entries[key] = { ...entry, status: "stale", lastError: verdict.issues.join("; "), updatedAt: new Date().toISOString() };
      changed = true;
    });
    if (changed) this.rebuildMergedStory();
  }

  private effectiveShape(): ArcTemplate | null {
    return this.extras.pacing.shapeOverride ?? this.loaded?.story.arc_template ?? null;
  }

  private computeExpectedTension(): number | null {
    const story = this.loaded?.story;
    if (!story) return null;
    const target = this.engine.activeCheckpoint?.tension_target;
    if (target) return levelToNumeric(target);
    const shape = this.effectiveShape();
    if (!shape) return null;
    const totalAnchors = story.checkpoints.filter((checkpoint) => checkpoint.type === "anchor").length;
    if (totalAnchors === 0) return null;
    const progress = this.engine.serialize().visitedAnchors.length / totalAnchors;
    return expectedTension(shape, progress);
  }

  private updateSteering() {
    if (!this.loaded) {
      clearStoryExtensionPrompt(PACING_HINT_EXTENSION_KEY);
      return;
    }
    const hint = getSteeringHint(this.extras.tension.smoothed, this.computeExpectedTension());
    if (this.extras.pacing.hintEnabled && hint) {
      setStoryExtensionPrompt(PACING_HINT_EXTENSION_KEY, hint.text, PACING_HINT_DEPTH);
    } else {
      clearStoryExtensionPrompt(PACING_HINT_EXTENSION_KEY);
    }
  }

  getEnabledCharacterIds(): string[] {
    if (!this.loaded) return [];
    const group = getActiveGroup();
    if (!group) return [];
    const disabled = new Set(group.disabled_members ?? []);
    return this.loaded.story.roster
      .filter((rosterMember) => {
        const memberId = resolveGroupMemberId(rosterMember.name ?? rosterMember.id);
        return memberId ? !disabled.has(memberId) : false;
      })
      .map((rosterMember) => rosterMember.id);
  }

  private getActiveSpeakerId(): string | null {
    if (!this.loaded) return null;
    const enabled = new Set(this.getEnabledCharacterIds());
    if (!enabled.size) return null;
    const chat = Array.isArray(getContext().chat) ? getContext().chat : [];
    for (let index = chat.length - 1; index >= 0; index -= 1) {
      const entry = chat[index] as { name?: string; is_user?: boolean } | undefined;
      if (!entry || entry.is_user || typeof entry.name !== "string" || !entry.name.trim()) continue;
      const speakerName = entry.name.trim().toLowerCase();
      const rosterMatch = this.loaded.story.roster.find((rosterMember) => (rosterMember.name ?? rosterMember.id).trim().toLowerCase() === speakerName);
      if (rosterMatch && enabled.has(rosterMatch.id)) return rosterMatch.id;
      return null;
    }
    return null;
  }

  private buildScoreContext(): ScoreContext {
    const chat = Array.isArray(getContext().chat) ? getContext().chat : [];
    let turnText = "";
    for (let index = chat.length - 1; index >= 0; index -= 1) {
      const entry = chat[index] as { mes?: string; is_system?: boolean } | undefined;
      if (entry && !entry.is_system && typeof entry.mes === "string" && entry.mes.trim()) {
        turnText = entry.mes;
        break;
      }
    }
    const rosterNames = this.loaded?.story.roster.map((member) => member.name ?? member.id) ?? [];
    const lowerTurn = turnText.toLowerCase();
    const turnEntities = rosterNames.filter((name) => lowerTurn.includes(name.trim().toLowerCase()));
    return {
      boundary: this.engine.getBoundary(),
      lastMessageId: chat.length - 1,
      turnText,
      turnEntities,
      openArcs: this.extras.memory.settings.enabled ? openArcTexts(this.extras.memory.arcs, ARC_OPEN_INJECT_LIMIT) : [],
      weights: this.extras.memory.settings.scoreWeights,
    };
  }

  private async computeEntryTokens(entries: MemoryEntry[]) {
    for (const entry of entries) {
      try {
        entry.tokens = await countTokens(entry.text);
      } catch {
        entry.tokens = undefined;
      }
    }
  }

  private namesForRosterId(id: string): string[] {
    const member = this.loaded?.story.roster.find((rosterMember) => rosterMember.id === id);
    return member ? [member.name ?? member.id, member.id] : [id];
  }

  private rosterIdForName(name: string): string | null {
    if (!this.loaded) return null;
    const search = name.trim().toLowerCase();
    const match = this.loaded.story.roster.find((rosterMember) => (rosterMember.name ?? rosterMember.id).trim().toLowerCase() === search);
    return match ? match.id : null;
  }

  private updateMemoryInjection() {
    if (!this.loaded || !this.extras.memory.settings.enabled) {
      clearAllMemoryInjection();
      this.stagedPrivate.clear();
      return;
    }
    const options = { tokenBudgets: this.extras.memory.settings.tierTokenBudgets, scoreContext: this.buildScoreContext() };
    const activeSpeaker = this.getActiveSpeakerId();
    applyMemoryInjection(this.extras.memory.entries, activeSpeaker, this.extras.memory.settings.injectionDepths, options);

    const blackboard = this.engine.serialize().blackboard;
    applyLedgerInjection(renderLedgerBlock(buildLedgerView(this.extras.memory.ledger, this.ledgerBindings(), blackboard.values, blackboard.versions)), LEDGER_INJECTION_DEPTH);

    this.stagedPrivate.clear();
    if (this.getEpistemicLedgerCapable()) {
      for (const id of this.getEnabledCharacterIds()) {
        const facts = buildMemoryInjectionBlocks(this.extras.memory.entries, id, options).facts;
        const epistemic = renderPrivateEpistemicBlock(this.extras.memory.epistemic, this.namesForRosterId(id));
        this.stagedPrivate.set(id, { facts, epistemic });
      }
      const speakerBlock = activeSpeaker ? (this.stagedPrivate.get(activeSpeaker)?.epistemic ?? "") : renderPrivateEpistemicBlock(this.extras.memory.epistemic, this.enabledCharacterNames());
      applyEpistemicInjection(speakerBlock, EPISTEMIC_INJECTION_DEPTH);
    } else {
      clearEpistemicInjection();
    }
  }

  private setPrivateInjectionBlocks(facts: string, epistemic: string) {
    applyEpistemicInjection(epistemic, EPISTEMIC_INJECTION_DEPTH);
    const factsKey = memoryExtensionKey("facts");
    if (facts) setStoryExtensionPrompt(factsKey, facts, this.extras.memory.settings.injectionDepths.facts);
    else clearStoryExtensionPrompt(factsKey);
  }

  onMemberDrafted(chId: number | [number]) {
    if (!this.loaded || !this.getEpistemicLedgerCapable()) return;
    const numericId = typeof chId === "number" ? chId : Array.isArray(chId) ? chId[0] : undefined;
    const name = getCharacterNameById(numericId);
    const rosterId = name ? this.rosterIdForName(name) : null;
    const staged = rosterId ? this.stagedPrivate.get(rosterId) : undefined;
    if (!staged) {
      const options = { tokenBudgets: this.extras.memory.settings.tierTokenBudgets, scoreContext: this.buildScoreContext() };
      this.setPrivateInjectionBlocks(buildMemoryInjectionBlocks(this.extras.memory.entries, this.getActiveSpeakerId(), options).facts, "");
      return;
    }
    this.setPrivateInjectionBlocks(staged.facts, staged.epistemic);
  }

  clearPrivateInjection() {
    if (!this.loaded) return;
    this.updateMemoryInjection();
  }

  getEpistemic(): EpistemicEntry[] {
    return this.extras.memory.epistemic;
  }

  getLedger(): LedgerView[] {
    if (!this.loaded) return [];
    const blackboard = this.engine.serialize().blackboard;
    return buildLedgerView(this.extras.memory.ledger, this.ledgerBindings(), blackboard.values, blackboard.versions);
  }

  getEpistemicBlock(): string {
    if (!this.loaded || !this.getEpistemicLedgerCapable()) return "";
    const speaker = this.getActiveSpeakerId();
    const names = speaker ? this.namesForRosterId(speaker) : this.enabledCharacterNames();
    return renderPrivateEpistemicBlock(this.extras.memory.epistemic, names);
  }

  getLedgerBlock(): string {
    if (!this.loaded || !this.extras.memory.settings.enabled) return "";
    return renderLedgerBlock(this.getLedger());
  }

  setEpistemicLedgerCapable(capable: boolean) {
    this.setMemorySettings({ epistemicLedgerCapable: capable });
  }

  async setEpistemicPinned(id: string, pinned: boolean) {
    this.extras.memory = { ...this.extras.memory, epistemic: setEpistemicPinned(this.extras.memory.epistemic, id, pinned) };
    this.updateMemoryInjection();
    await this.persist();
    this.notify();
  }

  async removeEpistemicEntry(id: string) {
    this.extras.memory = { ...this.extras.memory, epistemic: removeEpistemic(this.extras.memory.epistemic, id) };
    this.updateMemoryInjection();
    await this.persist();
    this.notify();
  }

  async setLedgerPinned(id: string, pinned: boolean) {
    this.extras.memory = { ...this.extras.memory, ledger: setLedgerPinned(this.extras.memory.ledger, id, pinned) };
    this.updateMemoryInjection();
    await this.persist();
    this.notify();
  }

  async removeLedgerEntry(id: string) {
    this.extras.memory = { ...this.extras.memory, ledger: removeLedger(this.extras.memory.ledger, id) };
    this.updateMemoryInjection();
    await this.persist();
    this.notify();
  }

  getMemoryInjectionBlocks(): Record<MemoryTier, string> {
    const entries = this.loaded && this.extras.memory.settings.enabled ? this.extras.memory.entries : [];
    return buildMemoryInjectionBlocks(entries, this.getActiveSpeakerId(), {
      tokenBudgets: this.extras.memory.settings.tierTokenBudgets,
      scoreContext: this.buildScoreContext(),
    });
  }

  async runConsolidation(): Promise<{ dropped: number; superseded: number; confirmed: number; uncertain: UncertainPair[] }> {
    const summary = { dropped: 0, superseded: 0, confirmed: 0, uncertain: [] as UncertainPair[] };
    if (!this.loaded || !this.extras.memory.settings.enabled || this.consolidationInFlight || this.extras.memory.backfill?.running) return summary;
    this.consolidationInFlight = true;
    try {
      const supersededWinnerIds = new Set<string>();
      const groupOf = () => {
        const active = this.extras.memory.entries.filter((entry) => !entry.supersededBy && !entry.foldedInto);
        const groups = new Map<string, MemoryEntry[]>();
        active.forEach((entry) => {
          const key = `${entry.tier}:${entry.characterId ?? "shared"}`;
          groups.set(key, [...(groups.get(key) ?? []), entry]);
        });
        return groups;
      };
      for (const group of groupOf().values()) {
        if (group.length < CONSOLIDATION_MIN_GROUP) continue;
        const matches = await this.buildMatchSets(group);
        const result = consolidateTier(group, matches);
        summary.uncertain.push(...result.uncertain);
        result.supersededPairs.forEach((pair) => supersededWinnerIds.add(pair.winnerId));
        if (!result.droppedIds.length && !result.supersededPairs.length && !result.confirmedIds.length) continue;
        this.extras.memory = { ...this.extras.memory, ...applyConsolidation(this.extras.memory, result), updatedAt: new Date().toISOString() };
        summary.dropped += result.droppedIds.length;
        summary.superseded += result.supersededPairs.length;
        summary.confirmed += result.confirmedIds.length;
      }
      if (summary.uncertain.length) this.extras.memory = { ...this.extras.memory, ...markContradicted(this.extras.memory, summary.uncertain) };
      if (summary.dropped || summary.superseded || summary.confirmed || summary.uncertain.length) {
        this.updateMemoryInjection();
        await this.persist();
        this.notify();
      }
      if (supersededWinnerIds.size) {
        const winners = this.extras.memory.entries.filter((entry) => supersededWinnerIds.has(entry.id));
        await this.runSupersessionBridge(winners);
      }
      await this.syncWorldInfo();
      await this.regenerateCanon();
      return summary;
    } finally {
      this.consolidationInFlight = false;
    }
  }

  async runSupersessionBridge(supersedingEntries: MemoryEntry[]): Promise<boolean> {
    if (!this.loaded || !supersedingEntries.length) return false;
    const state = this.engine.serialize();
    const scope = deriveScope(this.loaded.story, state.activeCheckpointId, state.blackboard, this.getExpansionGateSources());
    if (!scope.length) return false;
    const settings = this.getExtractionSettings();
    const messages = supersedingEntries.map((entry, index) => ({
      index,
      messageId: entry.messageId ?? state.boundary,
      speaker: "narration",
      text: entry.text,
    }));
    const window: SharedReadWindow = { from: messages[0].messageId, to: messages[messages.length - 1].messageId, messages };
    const result = await runSharedRead({
      story: this.loaded.story,
      state,
      priority: 1,
      reason: "supersede:bridge",
      window,
      scope,
      firedTransitions: this.getFiredTransitions(),
      facts: this.getExtractionFacts(),
      client: { ...settings, debugResponse: globalThis.storyOrchestratorDebugSupersessionResponse ?? null },
    });
    if (!result.audit.acceptedDeltas.length) return false;
    this.enqueueExtractorDeltas(result.audit.acceptedDeltas, result.audit.window);
    await this.persist();
    this.notify();
    return true;
  }

  private worldInfoLorebookName(): string {
    return `Story Orchestrator - ${this.loaded?.story.title ?? "memory"}`;
  }

  async syncWorldInfo(): Promise<{ created: number; updated: number; unchanged: number; disabled: number }> {
    const summary = { created: 0, updated: 0, unchanged: 0, disabled: 0 };
    if (!this.loaded || !this.extras.memory.settings.enabled) return summary;
    const lorebook = this.worldInfoLorebookName();
    const surfaceable = this.extras.memory.entries.filter((entry) =>
      !entry.supersededBy && !entry.foldedInto && (entry.type === "relationship" || (entry.tier === "scene_history" && entry.type === "scene")));
    const liveComments = new Set(surfaceable.map((entry) => `so_${entry.id}`));
    const writes = { ...this.extras.memory.wiWrites };
    for (const comment of Object.keys(writes)) {
      if (liveComments.has(comment)) continue;
      await disableWIEntry(lorebook, comment);
      delete writes[comment];
      summary.disabled += 1;
    }
    for (const entry of surfaceable) {
      const comment = `so_${entry.id}`;
      const hash = hashMemoryText(entry.text);
      if (writes[comment] === hash) {
        summary.unchanged += 1;
        continue;
      }
      const result = await upsertWIEntry(lorebook, comment, entry.text, entry.entities);
      if (result === "failed") continue;
      writes[comment] = hash;
      if (result === "created") summary.created += 1;
      else if (result === "updated") summary.updated += 1;
      else summary.unchanged += 1;
    }
    if (summary.created || summary.updated || summary.disabled) {
      this.extras.memory = { ...this.extras.memory, wiWrites: writes };
      await this.persist();
      this.notify();
    }
    return summary;
  }

  private async buildMatchSets(group: MemoryEntry[]): Promise<MatchSets> {
    const thresholds = DEFAULT_DEDUP_THRESHOLDS;
    const collectionId = `so_consol_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    try {
      await vectorInsert(collectionId, group.map((entry, index) => ({ hash: index, text: entry.text, index })), DEFAULT_VECTOR_SOURCE);
      const queryAt = (text: string, threshold: number) => vectorQuery(collectionId, text, group.length, threshold, DEFAULT_VECTOR_SOURCE).then((matches) => new Set(matches.map((match) => match.index)));
      const dup: Set<number>[] = [];
      const sameTopic: Set<number>[] = [];
      for (let i = 0; i < group.length; i += 1) {
        const [dupSameIdx, dupCrossIdx, sameIdx] = await Promise.all([
          queryAt(group[i].text, thresholds.cosineDup),
          queryAt(group[i].text, thresholds.cosineCrossDup),
          queryAt(group[i].text, thresholds.cosineSameTopic),
        ]);
        const dupSet = new Set<number>();
        const sameSet = new Set<number>();
        for (let j = 0; j < group.length; j += 1) {
          if (j === i) continue;
          const sameType = group[j].type === group[i].type;
          if (sameType ? dupSameIdx.has(j) : dupCrossIdx.has(j)) dupSet.add(j);
          else if (sameType && sameIdx.has(j)) sameSet.add(j);
        }
        dup.push(dupSet);
        sameTopic.push(sameSet);
      }
      return { dup, sameTopic };
    } catch (error) {
      console.warn("[Story memory] vector consolidation unavailable, using keyword overlap", error);
      return buildJaccardMatchSets(group, thresholds);
    } finally {
      try {
        await vectorPurge(collectionId);
      } catch {
        /* best effort */
      }
    }
  }

  private applyCommittedTension(result: BoundaryResult) {
    result.queue.applied.forEach((entry) => {
      const levels = entry.tensionLevels ?? [];
      let levelIndex = 0;
      entry.deltas.forEach((delta) => {
        if (delta.q !== TENSION_CURRENT_KEY || typeof delta.v !== "number") return;
        const level = levels[levelIndex];
        levelIndex += 1;
        this.extras.tension = {
          levels: level ? [...this.extras.tension.levels, level].slice(-50) : this.extras.tension.levels,
          smoothed: delta.v,
        };
      });
    });
  }

  private replayCommittedTension(): TensionRuntimeState {
    const tension = defaultTension();
    this.engine.stateLog.forEach((entry) => {
      entry.queue.applied.forEach((applied) => {
        const levels = applied.tensionLevels ?? [];
        let levelIndex = 0;
        applied.deltas.forEach((delta) => {
          if (delta.q !== TENSION_CURRENT_KEY || typeof delta.v !== "number") return;
          const level = levels[levelIndex];
          levelIndex += 1;
          if (level) tension.levels = [...tension.levels, level].slice(-50);
          tension.smoothed = delta.v;
        });
      });
    });
    return tension;
  }

  private getBoundaryContext(): BoundaryContext {
    const chat = Array.isArray(getContext().chat) ? getContext().chat : [];
    return { lastMessageId: chat.length - 1, chatLength: chat.length };
  }

  private refreshRequirements() {
    this.extras.requirements = evaluateRequirements(this.loaded?.story ?? null);
    this.extras.updatedAt = new Date().toISOString();
  }

  private parseQualityValue(type: string, value: string): PrimitiveValue | undefined {
    const trimmed = value.trim();
    if (type === "bool") {
      if (trimmed === "true") return true;
      if (trimmed === "false") return false;
      return undefined;
    }
    if (type === "int") {
      const parsed = Number(trimmed);
      return Number.isInteger(parsed) ? parsed : undefined;
    }
    if (type === "float") {
      const parsed = Number(trimmed);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    return trimmed;
  }
}

export const runtimeManager = new RuntimeManager();
