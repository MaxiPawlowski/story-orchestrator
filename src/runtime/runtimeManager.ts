import { StoryEngine, isValidationErrorList, TENSION_CURRENT_KEY, type ApplyQueueEntry, type ArcTemplate, type BoundaryContext, type BoundaryResult, type EngineState, type NormalizedStoryV2, type NormalizedTransition, type PrimitiveValue, type TensionLevel, type ValidationError } from "@engine/index";
import { getChatWindow, runSharedRead, type ParsedFact, type SharedReadAudit, type SharedReadWindow } from "@extraction/index";
import { expectedTension, getSteeringHint, numericToLevel, updateEma } from "@pacing/index";
import { clearStoryExtensionPrompt, getContext, setStoryExtensionPrompt } from "@services/STAPI";
import { DEFAULT_TENSION_EMA_ALPHA, PACING_HINT_DEPTH, PACING_HINT_EXTENSION_KEY } from "@constants/defaults";
import { EffectsApplier } from "./effectsApplier";
import { evaluateRequirements } from "./requirements";
import { loadPersistedRuntime, savePersistedRuntime, setSelectedStoryHash, getSelectedStoryHash } from "./persistence";
import { findStoryRecord, listStoryRecords, loadStoryRecord, saveStoryRecord } from "./storyLibrary";
import type { ExtractionRuntimeSettings, ExtractionRuntimeState, LoadedStory, PacingSettings, RuntimeExtras, RuntimeSnapshot, TensionRuntimeState } from "./types";

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
  facts: [],
  audits: [],
  lastReadBoundary: 0,
  scheduler: { queueDepth: 0, inFlight: false, lastError: null },
});

const createExtras = (): RuntimeExtras => ({
  firedNpcReplies: {},
  requirements: emptyRequirements,
  lastAppliedCheckpointId: null,
  lastSelfInjectionMessageId: null,
  extraction: createExtraction(),
  pacing: defaultPacingSettings(),
  tension: defaultTension(),
  updatedAt: new Date().toISOString(),
});

const sanitizeExtraction = (value: RuntimeExtras | undefined): ExtractionRuntimeState => {
  const existing = value?.extraction;
  if (!existing) return createExtraction();
  return {
    settings: { ...defaultExtractionSettings(), ...existing.settings },
    facts: Array.isArray(existing.facts) ? existing.facts : [],
    audits: Array.isArray(existing.audits) ? existing.audits.slice(-20) : [],
    lastReadBoundary: typeof existing.lastReadBoundary === "number" ? existing.lastReadBoundary : 0,
    scheduler: existing.scheduler ?? { queueDepth: 0, inFlight: false, lastError: null },
  };
};

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
  private pendingTension: TensionRuntimeState | null = null;

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

  async loadSelectedFromChat() {
    const hash = getSelectedStoryHash();
    if (!hash) {
      this.loaded = null;
      this.pendingTension = null;
      clearStoryExtensionPrompt(PACING_HINT_EXTENSION_KEY);
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
    const result = this.engine.commitBoundary(this.getBoundaryContext());
    if (result.effects) {
      await this.effects.applyCheckpoint(this.loaded.story, this.engine.activeCheckpoint, this.extras, this.getSnapshot(), "activate");
    } else if (this.extras.requirements.ready && this.extras.lastAppliedCheckpointId !== this.engine.activeCheckpoint.id) {
      await this.effects.applyCheckpoint(this.loaded.story, this.engine.activeCheckpoint, this.extras, this.getSnapshot(), "hydrate");
    }
    this.applyCommittedTension(result);
    this.pendingTension = null;
    this.updateSteering();
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
      this.extras.extraction.facts = this.extras.extraction.facts.filter((fact) => typeof fact.messageId !== "number" || fact.messageId < messageId);
      this.extras.extraction.audits = this.extras.extraction.audits.filter((audit) => audit.window.to < messageId);
      this.extras.tension = this.replayCommittedTension();
      this.pendingTension = null;
      this.refreshRequirements();
      await this.effects.applyCheckpoint(this.loaded.story, this.engine.activeCheckpoint, this.extras, this.getSnapshot(), "hydrate");
      this.updateSteering();
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

  getExtractionFacts(): ParsedFact[] {
    return [...this.extras.extraction.facts];
  }

  getFiredTransitions(): NormalizedTransition[] {
    return this.engine.stateLog.map((entry) => entry.fired).filter((transition): transition is NormalizedTransition => Boolean(transition));
  }

  setSchedulerSnapshot(snapshot: ExtractionRuntimeState["scheduler"]) {
    this.extras.extraction.scheduler = snapshot;
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

  async applyExtractionAudit(audit: SharedReadAudit, facts: ParsedFact[]) {
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
    const stampedFacts = facts.map((fact) => ({ ...fact, boundary: state.boundary, messageId: audit.window.to }));
    this.extras.extraction.facts = [...this.extras.extraction.facts, ...stampedFacts].slice(-50);
    this.extras.extraction.audits = [...this.extras.extraction.audits, audit].slice(-20);
    this.extras.extraction.lastReadBoundary = state.boundary;
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
      client: { ...settings, debugResponse: debugResponse ?? globalThis.storyOrchestratorDebugExtractionResponse ?? null },
    });
    await this.applyExtractionAudit(result.audit, result.facts);
    await this.commitBoundary();
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
      pacing: this.extras.pacing,
      tension: this.buildTensionSnapshot(),
    };
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
    this.loaded = loaded;
    this.validationErrors = [];
    this.engine.loadStory(loaded.story);
    this.pendingTension = null;
    const persisted = mode === "hydrate" ? loadPersistedRuntime(loaded.record.hash) : null;
    this.extras = persisted?.extras ?? createExtras();
    this.extras.extraction = sanitizeExtraction(this.extras);
    this.extras.pacing = sanitizePacing(this.extras.pacing);
    this.extras.tension = sanitizeTension(this.extras.tension);
    this.extras.lastSelfInjectionMessageId = typeof this.extras.lastSelfInjectionMessageId === "number" ? this.extras.lastSelfInjectionMessageId : null;
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
