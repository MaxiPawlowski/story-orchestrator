import { StoryEngine, effectiveThresholdFor, isValidationErrorList, progressQualityForAnchor, TENSION_CURRENT_KEY, type ApplyQueueEntry, type ArcTemplate, type BoundaryContext, type BoundaryResult, type EngineState, type NormalizedStoryV2, type NormalizedTransition, type PrimitiveValue, type TensionLevel, type ValidationError } from "@engine/index";
import { callExtractionModel, deriveFullScope, getCanonLite, getChatWindow, getLastMessageText, runSharedRead, type ParsedFact, type SharedReadAudit, type SharedReadWindow } from "@extraction/index";
import { findStubExpansionCandidate, collectExpansionGateSources, generateReviewedBeats, insertedCheckpointIds, mergeExpansions, planExpansion, revalidateExpansion, type ExpansionCacheEntry, type ExpansionRuntimeState, type StubExpansionCandidate } from "@generation/index";
import { addMemoryEntries, applyMemoryInjection, buildSceneSummaryPrompt, capAllTiers, clearAllMemoryInjection, createMemoryState, DEFAULT_TIER_BUDGETS, detectSceneBreakHeuristic, dropByMessageId, editEntryText, excludeEntry, expireScoped, generateMemoryId, setPinned, type MemoryEntry, type ParsedMemoryLine } from "@memory/index";
import { expectedTension, getSteeringHint, numericToLevel, updateEma } from "@pacing/index";
import { clearStoryExtensionPrompt, getActiveGroup, getContext, resolveGroupMemberId, setStoryExtensionPrompt } from "@services/STAPI";
import { DEFAULT_TENSION_EMA_ALPHA, MEMORY_TIER_INJECTION_DEPTHS, PACING_HINT_DEPTH, PACING_HINT_EXTENSION_KEY } from "@constants/defaults";
import { EffectsApplier } from "./effectsApplier";
import { evaluateRequirements } from "./requirements";
import { loadPersistedRuntime, savePersistedRuntime, setSelectedStoryHash, getSelectedStoryHash } from "./persistence";
import { findStoryRecord, listStoryRecords, loadStoryRecord, saveStoryRecord } from "./storyLibrary";
import type { ConvergenceReadout, ExtractionRuntimeSettings, ExtractionRuntimeState, LoadedStory, MemoryBackfillState, MemoryRuntimeSettings, MemoryRuntimeState, PacingSettings, RuntimeExtras, RuntimeSnapshot, TensionRuntimeState } from "./types";

const emptyRequirements = { ready: true, missingPersonas: [], missingMembers: [], missingLorebooks: [] };

const defaultExtractionSettings = (): ExtractionRuntimeSettings => ({ enabled: false, profileId: null, cadence: 3, reconciliationMultiplier: 1.5, stabilityLag: 1 });

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
  injectionDepths: { ...MEMORY_TIER_INJECTION_DEPTHS },
  tierBudgets: { ...DEFAULT_TIER_BUDGETS },
});

const createMemory = (): MemoryRuntimeState => ({
  ...createMemoryState(),
  settings: defaultMemorySettings(),
  backfill: null,
  sceneCount: 0,
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
      entries: existing.entries,
      excluded: Array.isArray(existing.excluded) ? existing.excluded : [],
      writeLog: Array.isArray(existing.writeLog) ? existing.writeLog.slice(-100) : [],
      settings: { ...defaultMemorySettings(), ...existing.settings },
      backfill: existing.backfill ? { ...existing.backfill, running: false } : null,
      sceneCount: typeof existing.sceneCount === "number" ? existing.sceneCount : 0,
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
    updatedAt: new Date().toISOString(),
  };
};

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
  private pendingTension: TensionRuntimeState | null = null;
  private sceneDetectCursor: { location: string | null; cast: string | null } | null = null;

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
    const result = this.engine.commitBoundary(this.getBoundaryContext());
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
      this.extras.memory = { ...this.extras.memory, ...dropByMessageId(this.extras.memory, messageId) };
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

  async applyExtractionAudit(audit: SharedReadAudit, facts: ParsedFact[], memoryLines: ParsedMemoryLine[] = []) {
    if (!this.loaded) return;
    const state = this.engine.serialize();
    const blackboardVersionSum = Object.values(state.blackboard.versions).reduce((sum, version) => sum + version, 0);
    if (audit.acceptedDeltas.length) {
      const tensionLevels: TensionLevel[] = [];
      audit.acceptedDeltas.forEach((entry) => {
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
        turnRange: audit.window,
        deltas: audit.acceptedDeltas.map((entry) => entry.delta),
        ...(tensionLevels.length ? { tensionLevels } : {}),
      });
    }
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
      const written = addMemoryEntries(this.extras.memory, newMemoryEntries, audit.window);
      const capped = capAllTiers(written.state, this.extras.memory.settings.tierBudgets);
      this.extras.memory = { ...this.extras.memory, ...capped, updatedAt: new Date().toISOString() };
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
    if (memoryEnabled && newMemoryEntries.length) this.updateMemoryInjection();
    await this.persist();
    this.notify();
    if (memoryEnabled && audit.sceneBreak) this.sceneBreakListeners.forEach((listener) => listener(audit));
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
      text: summary.trim(),
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
    const written = addMemoryEntries(this.extras.memory, [summaryEntry], audit.window);
    const capped = capAllTiers(expireScoped(written.state, "scene"), this.extras.memory.settings.tierBudgets);
    const sceneOccurrence = this.extras.memory.sceneCount + 1;
    this.extras.memory = { ...this.extras.memory, ...capped, sceneCount: sceneOccurrence, updatedAt: new Date().toISOString() };
    this.updateMemoryInjection();
    await this.effects.fireNpcReplies(this.engine.activeCheckpoint, this.extras, "sceneBreak", sceneOccurrence);
    await this.persist();
    this.notify();
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
      client: { ...settings, debugResponse: debugResponse ?? globalThis.storyOrchestratorDebugExtractionResponse ?? null },
    });
    await this.applyExtractionAudit(result.audit, result.facts, result.memory);
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
          client,
        });
        await this.applyExtractionAudit({ ...result.audit, acceptedDeltas: [] }, result.facts, result.memory);
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
      convergence: this.buildConvergenceReadout(),
      tension: this.buildTensionSnapshot(),
    };
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
    this.extras = persisted?.extras ?? createExtras();
    this.extras.memory = sanitizeMemory(this.extras);
    this.extras.extraction = sanitizeExtraction(this.extras);
    this.extras.expansion = sanitizeExpansion(this.extras);
    this.extras.pacing = sanitizePacing(this.extras.pacing);
    this.extras.tension = sanitizeTension(this.extras.tension);
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
    setSelectedStoryHash(loaded.record.hash);
    await this.persist();
    this.notify();
  }

  private async persist() {
    if (!this.loaded) return;
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
      const input = planExpansion(this.loaded.story, state.blackboard, candidate, getCanonLite(this.loaded.story, state.visitedAnchors, this.getFiredTransitions(), facts), facts.map((fact) => fact.text));
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
    const values = this.engine.serialize().blackboard.values;
    Object.entries(this.extras.expansion.entries).forEach(([key, entry]) => {
      if (!["inserted", "cached", "needs_review"].includes(entry.status)) return;
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
    const shape = this.effectiveShape();
    const story = this.loaded?.story;
    if (!shape || !story) return null;
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

  private updateMemoryInjection() {
    if (!this.loaded || !this.extras.memory.settings.enabled) {
      clearAllMemoryInjection();
      return;
    }
    applyMemoryInjection(this.extras.memory.entries, this.getActiveSpeakerId(), this.extras.memory.settings.injectionDepths);
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
