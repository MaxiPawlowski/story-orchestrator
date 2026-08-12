import type { EngineState, NormalizedStoryV2, NormalizedTransition } from "@engine/index";
import { callExtractionModel, deriveFullScope, getChatWindow, getLastMessageText, runSharedRead, stripChannelNoise, type ExtraGateSource, type ParsedDelta, type ParsedFact, type SharedReadAudit } from "@extraction/index";
import { buildEpistemicPassPrompt, buildLedgerPassPrompt, buildSceneSummaryPrompt, buildShortTermSummaryPrompt, detectSceneBreakHeuristic, generateMemoryId, parseEpistemicLine, parseEpistemicRetire, parseLedgerLine, type ArcEntry, type MemoryEntry, type ParsedArcSignal, type ParsedEpistemicSignal, type ParsedLedgerSignal, type ParsedMemoryLine } from "@memory/index";
import { getActiveGroup, getContext } from "@services/STAPI";
import { SHORT_TERM_COMPACTION_MESSAGES } from "@constants/defaults";
import { enabledCharacterNames } from "../roster";
import type { MemoryCoordinator } from "./memoryCoordinator";
import type { ExtractionRuntimeSettings, ExtractionRuntimeState } from "../types";

export interface ExtractionCoordinatorDeps {
  getStory: () => NormalizedStoryV2 | null;
  getState: () => EngineState | null;
  getExtraction: () => ExtractionRuntimeState;
  getSettings: () => ExtractionRuntimeSettings;
  memory: MemoryCoordinator;
  getFiredTransitions: () => NormalizedTransition[];
  getExpansionGateSources: () => ExtraGateSource[];
  enqueueExtractorDeltas: (accepted: ParsedDelta[], window: { from: number; to: number }) => void;
  commitBoundary: () => Promise<unknown>;
  fireSceneBreakReplies: (occurrence: number) => Promise<void>;
  emitSceneBreak: (audit: SharedReadAudit) => void;
  emitArcsResolved: (arcs: ArcEntry[]) => void;
  setStatus: (status: string) => void;
  persist: () => Promise<void>;
  notify: () => void;
}

// Owns extras.extraction and every off-path read: the shared-read audit pipeline, the
// scene-break / short-term / epistemic-ledger passes and the memorize backlog. Per-tier writes
// are delegated to the memory coordinator — this class never touches extras.memory directly.
export class ExtractionCoordinator {
  private sceneDetectCursor: { location: string | null; cast: string | null } | null = null;

  constructor(private readonly deps: ExtractionCoordinatorDeps) {}

  private get state(): ExtractionRuntimeState {
    return this.deps.getExtraction();
  }

  private async save() {
    await this.deps.persist();
    this.deps.notify();
  }

  private newEntry(fields: Pick<MemoryEntry, "tier" | "text" | "type" | "importance" | "expiration" | "entities" | "evidence"> & Partial<MemoryEntry>): MemoryEntry {
    return {
      id: generateMemoryId(),
      confidence: 1,
      activationTriggers: [],
      createdAt: this.deps.getState()?.boundary ?? 0,
      recallCount: 0,
      ...fields,
    };
  }

  recordReconciliation(descriptor: { checkpointId: string; boundary: number; targetedKeys: string[] }) {
    const id = `${descriptor.boundary}:${descriptor.targetedKeys.join(",")}`;
    const event = { id, boundary: descriptor.boundary, checkpointId: descriptor.checkpointId, targetedKeys: descriptor.targetedKeys, scheduledAt: new Date().toISOString(), resolvedAt: null, evidence: [] };
    this.state.reconciliationEvents = [...this.state.reconciliationEvents, event].slice(-50);
    void this.save();
  }

  private resolveReconciliation(audit: SharedReadAudit) {
    const evidence = audit.acceptedDeltas.map((entry) => `${entry.delta.q}=${String(entry.delta.v)} (${entry.evidence})`);
    const events = [...this.state.reconciliationEvents];
    for (let index = 0; index < events.length; index += 1) {
      if (events[index].resolvedAt === null) {
        events[index] = { ...events[index], resolvedAt: new Date().toISOString(), evidence: [...events[index].evidence, ...evidence] };
        break;
      }
    }
    this.state.reconciliationEvents = events;
  }

  setSchedulerSnapshot(snapshot: ExtractionRuntimeState["scheduler"]) {
    this.state.scheduler = snapshot;
  }

  pause(message: string) {
    this.state.scheduler = { ...this.state.scheduler, lastError: message };
  }

  async applyAudit(audit: SharedReadAudit, facts: ParsedFact[], memoryLines: ParsedMemoryLine[] = [], arcSignals: ParsedArcSignal[] = [], epistemicSignals: ParsedEpistemicSignal[] = [], ledgerSignals: ParsedLedgerSignal[] = []) {
    if (!this.deps.getStory()) return;
    const boundary = this.deps.getState()?.boundary ?? 0;
    this.deps.enqueueExtractorDeltas(audit.acceptedDeltas, audit.window);
    const memory = this.deps.memory;
    const newMemoryEntries: MemoryEntry[] = [
      ...facts.map((fact) => this.newEntry({ tier: "facts", text: fact.text, type: "fact", importance: fact.importance, expiration: "permanent", entities: [], evidence: fact.evidence, messageId: audit.window.to })),
      ...memoryLines.map((line) => this.newEntry({ tier: line.tier, text: line.text, type: line.type, importance: line.importance, expiration: line.expiration, entities: line.entities, evidence: line.evidence, characterId: line.characterId, messageId: audit.window.to })),
    ];
    const memoryEnabled = memory.enabled;
    await memory.applyEntries(newMemoryEntries, audit.window);
    const resolvedArcs = memoryEnabled && arcSignals.length ? memory.applyArcSignals(arcSignals, audit.window.to) : [];
    if (memory.capable && epistemicSignals.length) memory.applyEpistemic(epistemicSignals, audit.window.to);
    if (memory.capable && ledgerSignals.length) memory.applyLedger(ledgerSignals, audit.window.to);
    this.state.audits = [...this.state.audits, audit].slice(-20);
    if (audit.reason.startsWith("reconcile:")) this.resolveReconciliation(audit);
    this.state.lastReadBoundary = boundary;
    if (memoryEnabled && (newMemoryEntries.length || arcSignals.length || epistemicSignals.length || ledgerSignals.length)) memory.updateInjection();
    if (resolvedArcs.length) this.deps.emitArcsResolved(resolvedArcs);
    await this.save();
    if (memoryEnabled && audit.sceneBreak) this.deps.emitSceneBreak(audit);
  }

  async runNow(debugResponse?: string, reason = "manual") {
    const story = this.deps.getStory();
    const state = this.deps.getState();
    if (!story || !state) return false;
    const memory = this.deps.memory;
    const result = await runSharedRead({
      story,
      state,
      priority: 0,
      reason,
      facts: memory.getFacts(),
      firedTransitions: this.deps.getFiredTransitions(),
      extraGateSources: this.deps.getExpansionGateSources(),
      openArcs: memory.getOpenArcs(),
      epistemicLedgerCapable: memory.capable,
      entities: memory.getEntities(),
      client: { ...this.deps.getSettings(), debugResponse: debugResponse ?? globalThis.storyOrchestratorDebugExtractionResponse ?? null },
    });
    await this.applyAudit(result.audit, result.facts, result.memory, result.arcs, result.epistemic, result.ledger);
    await this.deps.commitBoundary();
    return true;
  }

  // Scene detection is a cursor over blackboard location + enabled cast: only a change since the
  // previous boundary counts, so the first observation never fires.
  detectSceneBreak() {
    const story = this.deps.getStory();
    if (!story || !this.deps.memory.enabled) return null;
    const text = getLastMessageText();
    if (!text) return null;
    const location = this.deps.getState()?.blackboard.values.location;
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
    const memory = this.deps.memory;
    if (!this.deps.getStory() || !audit.sceneBreak || !memory.enabled) return;
    const window = getChatWindow(audit.window.from, audit.window.to);
    const sceneText = window.messages.map((message) => `${message.speaker}: ${message.text}`).join("\n") || "(empty)";
    const summary = await callExtractionModel(buildSceneSummaryPrompt(sceneText), {
      profileId: this.deps.getSettings().profileId,
      debugResponse: globalThis.storyOrchestratorDebugSceneSummaryResponse ?? null,
    });
    const entry = this.newEntry({ tier: "scene_history", text: stripChannelNoise(summary), type: "scene", importance: 2, expiration: "permanent", entities: [], evidence: sceneText, messageId: audit.window.to });
    const sceneOccurrence = await memory.addSceneSummary(entry, audit.window);
    memory.updateInjection();
    await this.deps.fireSceneBreakReplies(sceneOccurrence);
    await this.save();
    await memory.syncWorldInfo();
  }

  shouldCompactShortTerm(lastMessageId: number): boolean {
    if (!this.deps.getStory() || !this.deps.memory.enabled) return false;
    return lastMessageId - this.deps.memory.shortTermSummaryEnd >= SHORT_TERM_COMPACTION_MESSAGES;
  }

  async runShortTermCompaction() {
    const memory = this.deps.memory;
    if (!this.deps.getStory() || !memory.enabled) return;
    const lastId = (Array.isArray(getContext().chat) ? getContext().chat.length : 0) - 1;
    if (!this.shouldCompactShortTerm(lastId)) return;
    const window = getChatWindow(memory.shortTermSummaryEnd + 1, lastId);
    const recentText = window.messages.map((message) => `${message.speaker}: ${message.text}`).join("\n");
    if (!recentText) return;
    const previous = memory.shortTermEntry();
    if (previous?.pinned) return;
    const summary = stripChannelNoise(await callExtractionModel(buildShortTermSummaryPrompt(previous?.text ?? null, recentText), {
      profileId: this.deps.getSettings().profileId,
      debugResponse: globalThis.storyOrchestratorDebugShortTermResponse ?? null,
    }));
    if (!summary) return;
    const entry = this.newEntry({ tier: "short_term", text: summary, type: "scene", importance: 2, expiration: "session", entities: [], evidence: recentText, messageId: window.to });
    await memory.replaceShortTerm(entry, window.to);
    memory.updateInjection();
    await this.save();
  }

  async runEpistemicLedgerPass(audit: SharedReadAudit): Promise<boolean> {
    const story = this.deps.getStory();
    const memory = this.deps.memory;
    if (!story || !audit.sceneBreak || !memory.capable) return false;
    const settings = this.deps.getSettings();
    const window = getChatWindow(audit.window.from, audit.window.to);
    const sceneText = window.messages.map((message) => `${message.speaker}: ${message.text}`).join("\n") || "(empty)";

    const existing = memory.activeEpistemic();
    const epistemicResponse = await callExtractionModel(buildEpistemicPassPrompt(sceneText, enabledCharacterNames(story), existing.map((entry) => ({ tag: entry.tag, subject: entry.subject, content: entry.content, hiddenFrom: entry.hiddenFrom }))), {
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
    memory.applyEpistemic(epistemicSignals, audit.window.to, retireIds);

    const ledgerResponse = await callExtractionModel(buildLedgerPassPrompt(sceneText, memory.ledgerEntityList()), {
      profileId: settings.profileId,
      debugResponse: globalThis.storyOrchestratorDebugLedgerResponse ?? null,
    });
    const ledgerSignals: ParsedLedgerSignal[] = [];
    for (const line of stripChannelNoise(ledgerResponse).split(/\r?\n/)) ledgerSignals.push(...parseLedgerLine(line.trim()));
    memory.applyLedger(ledgerSignals, audit.window.to);
    memory.updateInjection();
    await this.save();
    return epistemicSignals.length > 0 || ledgerSignals.length > 0 || retireIds.length > 0;
  }

  // Full-scope re-read of an existing chat, window by window, then one whole-chat pass that is
  // allowed to move the blackboard. Progress is surfaced through the memory backfill state.
  async runMemorizeBacklog(windowSize = 8): Promise<boolean> {
    const story = this.deps.getStory();
    const memory = this.deps.memory;
    if (!story || !memory.enabled || memory.backfill?.running) return false;
    const chat = Array.isArray(getContext().chat) ? getContext().chat : [];
    const total = Math.max(1, Math.ceil(chat.length / windowSize)) + 1;
    memory.setBackfill({ running: true, processed: 0, total, lastError: null });
    await this.save();
    try {
      const client = { ...this.deps.getSettings(), debugResponse: globalThis.storyOrchestratorDebugExtractionResponse ?? null };
      for (let from = 0; from < chat.length; from += windowSize) {
        const to = Math.min(chat.length - 1, from + windowSize - 1);
        const state = this.deps.getState()!;
        const result = await runSharedRead({
          story,
          state,
          priority: 0,
          reason: "memorize:window",
          window: getChatWindow(from, to),
          scope: deriveFullScope(story, state.blackboard),
          firedTransitions: this.deps.getFiredTransitions(),
          facts: memory.getFacts(),
          openArcs: memory.getOpenArcs(),
          epistemicLedgerCapable: memory.capable,
          entities: memory.getEntities(),
          client,
        });
        await this.applyAudit({ ...result.audit, acceptedDeltas: [] }, result.facts, result.memory, result.arcs, result.epistemic, result.ledger);
        const progress = memory.backfill!;
        memory.setBackfill({ ...progress, processed: progress.processed + 1 });
        await this.save();
      }

      const finalState = this.deps.getState()!;
      const fullResult = await runSharedRead({
        story,
        state: finalState,
        priority: 0,
        reason: "memorize:full",
        window: getChatWindow(0, Math.max(0, chat.length - 1)),
        scope: deriveFullScope(story, finalState.blackboard),
        firedTransitions: this.deps.getFiredTransitions(),
        facts: memory.getFacts(),
        client,
      });
      await this.applyAudit(fullResult.audit, [], []);
      await this.deps.commitBoundary();

      memory.setBackfill({ running: false, processed: total, total, lastError: null });
      this.deps.setStatus("Memorize backlog complete");
      await this.save();
      return true;
    } catch (error) {
      memory.setBackfill({ ...memory.backfill!, running: false, lastError: error instanceof Error ? error.message : "Memorize backlog failed" });
      this.deps.setStatus("Memorize backlog failed");
      await this.save();
      return false;
    }
  }
}
