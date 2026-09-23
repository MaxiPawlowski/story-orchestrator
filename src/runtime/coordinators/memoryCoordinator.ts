import { progressQualityForAnchor, type BlackboardDelta, type EngineState, type NormalizedStoryV2, type NormalizedTransition } from "@engine/index";
import { callExtractionModel, deriveScope, getCanonLite, runSharedRead, stripChannelNoise, type ExtraGateSource, type ParsedDelta, type ParsedFact, type SharedReadWindow } from "@extraction/index";
import { activeEpistemic, addMemoryEntries, applyArcSignals, applyConsolidation, applyEpistemicInjection, applyEpistemicSignals, applyLedgerInjection, applyLedgerSignals, applyMemoryInjection, ARC_OPEN_INJECT_LIMIT, buildArcSummaryPrompt, buildBoundKeySet, buildCanonSummaryPrompt, buildLedgerView, buildMemoryInjectionBlocks, canonHistory, canonInputHash, capAllTiers, capEpistemic, capLedger, highImportanceFacts, isLive, ledgerBindings, ledgerEntityList, storyEntities, disappearingEntries, recordDerived, reverseMemoryState,
 dropCommonKnowledge, capOpenArcs, capResolvedArcs, clearAllMemoryInjection, clearEpistemicInjection, CONSOLIDATION_MIN_GROUP, consolidateTier, DEFAULT_DEDUP_THRESHOLDS, editEntryText, expireScoped, markContradicted, matchArcBridges, memoryExtensionKey, openArcTexts, removeArc, removeEpistemic, removeLedger, renderLedgerBlock, renderPrivateEpistemicBlock, resolvedArcs, restoreEntry, setArcPinned, setLocked, setArcSummary, setEpistemicPinned, setLedgerPinned, setPinned, type ArcEntry, type ConflictPair, type DerivedRecord, type EpistemicEntry, type LedgerBinding, type LedgerView, type MemoryEntry, type MemoryTier, type ParsedArcSignal, type ParsedEpistemicSignal, type ParsedLedgerSignal, type ScoreContext, type UncertainPair, consolidateTierJudged, clearContradicted } from "@memory/index";
import { bindChatLorebook, clearStoryExtensionPrompt, disableWIEntry, ensureLorebook, getActiveGroup, getCharacterNameById, getContext, loadLorebook, readInjectedPromptBlocks, setStoryExtensionPrompt, upsertWIEntry, } from "@services/STAPI";
import { EPISTEMIC_INJECTION_DEPTH, EPISTEMIC_INJECTION_KEY, LEDGER_INJECTION_DEPTH } from "@constants/defaults";
import type { SceneReadRecord } from "@judge/index";
import type { Provenance } from "@memory/provenance";
import { sceneConflictValues } from "@memory/conflicts";

import { emptyMirrorSummary, syncMemoryMirror, type MemoryMirrorSummary } from "../memoryMirror";
import { buildMatchSets, judgePairRelations } from "../consolidationMatches";
import { boundProvenance, boundValuesFor, detectMemoryConflicts, discardMemoryRow, dismissMemoryConflict, getConflicts, reconfirmMemoryEntry, rereadConflictWindow, resolveMemoryConflict, storeDroppedEntry, type MemoryQueueDeps } from "../memoryQueue";
import { buildScoreContext } from "../scoreContext";
import type { JudgeRuntime } from "../judge";
import { beginRun, type RunOwnership } from "../runToken";
import { computeEntryTokens, tokensFor } from "../entryTokens";
import { PAIR_JACCARD_FLOOR } from "@judge/index";
import { activeSpeakerId, enabledCharacterIds, enabledCharacterNames, namesForRosterId, rosterIdForName, rosterMemberName } from "../roster";
import { VERIFY_DROP_LIMIT, type CanonSource, type ExtractionRuntimeSettings, type MemoryBackfillState, type MemoryRuntimeState, type VerifyDrop } from "../types";

export interface MemoryCoordinatorDeps {
  getStory: () => NormalizedStoryV2 | null;
  getState: () => EngineState | null;
  getMemory: () => MemoryRuntimeState;
  setMemory: (next: MemoryRuntimeState) => void;
  getExtractionSettings: () => ExtractionRuntimeSettings;
  getFiredTransitions: () => NormalizedTransition[];
  getExpansionGateSources: () => ExtraGateSource[];
  enqueueExtractorDeltas: (accepted: ParsedDelta[], window: { from: number; to: number }) => void;
  enqueueMechanical: (deltas: BlackboardDelta[]) => void;
  judge?: () => JudgeRuntime | null;
  persist: () => Promise<void>;
  /** v2.3 plan 05: whether the last save is still unwritten — the plan-06 save evidence. A queue
   *  decision reads it because `persist` cannot answer the question itself (see `memoryQueue`). */
  unsaved?: () => boolean;
  notify: () => void;
  ownership?: RunOwnership;
  historyFloor?: () => number | null;
  /** v2.3 plan 05: the stored scene read, whose claims the ledger and the blackboard can contradict. */
  getScene?: () => SceneReadRecord | null;
  /** v2.3 plan 05: read a named span again, rather than whatever the transcript now ends with. */
  rereadWindow?: (window: { from: number; to: number }, reason: string) => Promise<unknown>;
}

// Owns everything that reads or writes extras.memory: tiers, arcs, canon, epistemic, ledger,
// consolidation, World Info mirroring and prompt injection. The manager keeps the persist
// boundary — this class only mutates the slice and asks for a save.
export class MemoryCoordinator {
  private stagedPrivate = new Map<string, { facts: string; epistemic: string }>();
  private consolidationInFlight = false;
  private canonInFlight = false;

  constructor(private readonly deps: MemoryCoordinatorDeps) {}

  private get state(): MemoryRuntimeState {
    return this.deps.getMemory();
  }

  private patch(next: Partial<MemoryRuntimeState>, touch = true) {
    this.deps.setMemory({ ...this.state, ...next, ...(touch ? { updatedAt: new Date().toISOString() } : {}) });
  }

  private async save() { await this.deps.persist(); this.deps.notify(); }

  private async commit(apply: () => Partial<MemoryRuntimeState>) {
    this.patch(apply(), false);
    this.updateInjection();
    await this.save();
  }

  private boundaryStamp() { return this.deps.getState()?.boundary ?? 0; }

  // v2.3 plan 04: what this write derived, what it was built from, and what it took away. Recorded
  // with the write, so a rollback past the input can drop the artifact and restore the removal.
  private record(input: Omit<DerivedRecord, "id" | "boundary" | "messageId"> & { messageId?: number }) {
    const state = this.deps.getState();
    this.patch({ derived: recordDerived(this.state.derived, { boundary: state?.boundary ?? 0, messageId: state?.lastMessageId ?? -1, ...input }) }, false);
  }

  get enabled(): boolean {
    return this.state.settings.enabled;
  }

  get capable(): boolean {
    return this.state.settings.enabled && this.state.settings.epistemicLedgerCapable;
  }

  ledgerBindings(): LedgerBinding[] {
    return ledgerBindings(this.deps.getStory());
  }

  ledgerEntityList(): Array<{ name: string; type: string }> {
    return ledgerEntityList(this.deps.getStory(), this.state.ledger, rosterMemberName);
  }

  getEntities(): string[] {
    return storyEntities(this.deps.getStory(), this.state.ledger, rosterMemberName);
  }

  getFacts(): ParsedFact[] {
    return this.state.entries.filter((entry) => isLive(entry)).filter((entry) => entry.tier === "facts").map((entry) => ({ text: entry.text, evidence: entry.evidence, importance: entry.importance, boundary: entry.createdAt, messageId: entry.messageId }));
  }

  private highImportanceFacts(limit: number): MemoryEntry[] {
    return highImportanceFacts(this.state.entries, limit);
  }

  // --- tiers -------------------------------------------------------------

  async applyEntries(entries: MemoryEntry[], window: { from: number; to: number }) {
    if (!this.enabled || !entries.length) return;
    // The token count is a host call, so this write is an await past the caller's own check.
    const run = beginRun(this.deps.ownership, window);
    await computeEntryTokens(entries);
    if (!run.stillOwns()) return;
    const written = addMemoryEntries(this.state, entries, window);
    this.patch(capAllTiers(written.state, this.state.settings.tierBudgets));
  }

  async addSceneSummary(entry: MemoryEntry, window: { from: number; to: number }): Promise<number | null> {
    const run = beginRun(this.deps.ownership, window);
    await computeEntryTokens([entry]);
    if (!run.stillOwns()) return null;
    const written = addMemoryEntries(this.state, entry.text ? [entry] : [], window);
    const capped = capAllTiers(expireScoped(written.state, "scene"), this.state.settings.tierBudgets);
    const sceneOccurrence = this.state.sceneCount + 1;
    this.record({ kind: "scene_summary", inputs: [], outputId: written.accepted[0]?.id, range: window, removed: disappearingEntries(this.state.entries, capped.entries), messageId: window.to });
    this.patch({ ...capped, sceneCount: sceneOccurrence });
    return sceneOccurrence;
  }

  async replaceShortTerm(entry: MemoryEntry, window: { from: number; to: number }) {
    const run = beginRun(this.deps.ownership, window);
    await computeEntryTokens([entry]);
    if (!run.stillOwns()) return;
    const entries = [...this.state.entries.filter((candidate) => candidate.tier !== "short_term"), entry];
    const replaced = this.state.entries.filter((candidate) => candidate.tier === "short_term");
    this.record({ kind: "short_term", inputs: replaced.map((candidate) => candidate.id), outputId: entry.id, range: window, removed: disappearingEntries(this.state.entries, entries), messageId: window.to });
    this.patch({ entries, shortTermSummaryEnd: window.to });
  }

  shortTermEntry(): MemoryEntry | undefined {
    return this.state.entries.find((entry) => entry.tier === "short_term");
  }

  get shortTermSummaryEnd(): number {
    return this.state.shortTermSummaryEnd;
  }

  get backfill(): MemoryBackfillState | null {
    return this.state.backfill;
  }

  setBackfill(next: MemoryBackfillState | null) {
    this.patch({ backfill: next }, false);
  }

  async setMemoryPinned(id: string, pinned: boolean) { await this.commit(() => setPinned(this.state, id, pinned)); }

  /** M6. Lock freezes the story's truth: no pass may retire it, and a contradiction is queued. */
  async setMemoryLocked(id: string, locked: boolean) { await this.commit(() => setLocked(this.state, id, locked, new Date().toISOString(), this.boundaryStamp())); }

  excludeMemoryEntry(id: string): Promise<boolean> { return discardMemoryRow(this.queueDeps(), id); }

  async restoreMemoryEntry(entry: MemoryEntry) { await this.commit(() => restoreEntry(this.state, entry)); }

  async editMemoryEntry(id: string, text: string) {
    const run = beginRun(this.deps.ownership);
    await this.commit(() => editEntryText(this.state, id, text, new Date().toISOString(), this.boundaryStamp()));
    const tokens = await tokensFor(text);
    if (tokens === undefined || !run.stillOwns()) return;
    this.patch({ entries: this.state.entries.map((entry) => (entry.id === id && entry.text === text ? { ...entry, tokens } : entry)) }, false);
    this.updateInjection();
  }

  // --- arcs --------------------------------------------------------------

  applyArcSignals(signals: ParsedArcSignal[], messageId: number): ArcEntry[] {
    const applied = applyArcSignals(this.state.arcs, signals, { boundary: this.boundaryStamp(), messageId });
    this.patch({ arcs: capOpenArcs(capResolvedArcs(applied.arcs)) });
    return applied.resolved;
  }

  getArcs(): ArcEntry[] {
    return this.state.arcs;
  }

  getOpenArcs(): string[] {
    return this.deps.getStory() && this.enabled ? openArcTexts(this.state.arcs, ARC_OPEN_INJECT_LIMIT) : [];
  }

  async setArcPinned(id: string, pinned: boolean) { await this.commit(() => ({ arcs: setArcPinned(this.state.arcs, id, pinned) })); }

  async removeArc(id: string) { await this.commit(() => ({ arcs: removeArc(this.state.arcs, id) })); }

  // Resolved arcs matching an authored bridge keyword increment their anchor's progress quality
  // through the normal apply queue — code-side, so the write lands at the next boundary.
  enqueueArcBridges(): ArcEntry[] {
    const story = this.deps.getStory();
    const bridges = story?.arc_bridges ?? [];
    if (!story || !bridges.length) return [];
    const pending = this.state.arcs.filter((arc) => arc.status === "resolved" && !arc.bridgeApplied && matchArcBridges(bridges, [arc]).size > 0);
    if (!pending.length) return [];
    const increments = matchArcBridges(bridges, pending);
    if (!increments.size) return pending;
    const values = this.deps.getState()?.blackboard.values ?? {};
    const deltas: BlackboardDelta[] = [];
    increments.forEach((amount, anchor) => {
      const key = progressQualityForAnchor(anchor);
      const current = typeof values[key] === "number" ? (values[key] as number) : 0;
      deltas.push({ q: key, v: current + amount, source: "code" });
    });
    this.deps.enqueueMechanical(deltas);
    return pending;
  }

  markBridgesApplied(applied: ArcEntry[]) {
    if (!applied.length) return;
    const ids = new Set(applied.map((arc) => arc.id));
    this.patch({ arcs: this.state.arcs.map((arc) => (ids.has(arc.id) ? { ...arc, bridgeApplied: true } : arc)) }, false);
  }

  async runArcSummaryPass(arcIds: string[]): Promise<boolean> {
    if (!this.deps.getStory() || !this.enabled || !arcIds.length) return false;
    const settings = this.deps.getExtractionSettings();
    const sceneSummaries = this.state.entries.filter((entry) => entry.tier === "scene_history").slice(-5).map((entry, index) => `Scene ${index + 1}: ${entry.text}`).join("\n");
    const memories = this.highImportanceFacts(20).map((entry) => `[${entry.type}] ${entry.text}`).join("\n");
    // One await and one write PER ARC, which is why the guard is a handle rather than a wrapper:
    // the check belongs inside the loop, immediately before each write, not around the whole pass.
    // Without it a five-arc pass that outlives a chat switch writes the remaining four into the
    // new chat.
    const run = beginRun(this.deps.ownership);
    let changed = false;
    for (const id of arcIds) {
      const arc = this.state.arcs.find((candidate) => candidate.id === id);
      if (!arc || arc.status !== "resolved" || arc.summary) continue;
      const summary = await callExtractionModel(buildArcSummaryPrompt(arc.text, sceneSummaries, memories), {
        profileId: settings.profileId,
        debugResponse: globalThis.storyOrchestratorDebugArcSummaryResponse ?? null,
      });
      if (!run.stillOwns()) break;
      const trimmed = stripChannelNoise(summary);
      if (!trimmed) continue;
      this.record({ kind: "arc_summary", inputs: [id] });
      this.patch({ arcs: setArcSummary(this.state.arcs, id, trimmed) });
      changed = true;
    }
    if (changed) {
      await this.regenerateCanon();
      await this.save();
    }
    return changed;
  }

  // --- reconciliation queue (v2.3 plan 05, C3) -------------------------------------------

  private queueDeps(): MemoryQueueDeps {
    return {
      getMemory: () => this.state,
      patch: (next, touch) => this.patch(next, touch),
      boundValues: () => boundValuesFor(this.ledgerBindings(), this.deps.getState()?.blackboard?.values ?? {}, this.deps.getState()?.blackboard?.versions ?? {}),
      sceneValues: () => sceneConflictValues(this.deps.getScene?.()),
      boundaryStamp: () => this.boundaryStamp(),
      lastMessageId: () => this.deps.getState()?.lastMessageId ?? -1,
      updateInjection: () => this.updateInjection(),
      // A decided disagreement changes what a canon synthesis would have been built from, so the text
      // derived from the losing claim stops being read until the next pass replaces it.
      invalidateCanon: () => { if (this.state.canon && !this.state.canon.stale) this.patch({ canon: { ...this.state.canon, stale: true } }, false); },
      ...(this.deps.rereadWindow ? { reread: (window: { from: number; to: number }, reason: string) => this.deps.rereadWindow!(window, reason) } : {}),
      unsaved: () => this.deps.unsaved?.() ?? false,
      save: () => this.save(),
    };
  }

  detectMemoryConflicts(): ConflictPair[] { return detectMemoryConflicts(this.queueDeps()); }
  getConflicts(): ConflictPair[] { return getConflicts(this.queueDeps()); }
  resolveMemoryConflict(key: string, keepId: string, lock = false): Promise<boolean> { return resolveMemoryConflict(this.queueDeps(), key, keepId, lock); }
  dismissMemoryConflict(key: string): Promise<boolean> { return dismissMemoryConflict(this.queueDeps(), key); }
  rereadConflictWindow(key: string): Promise<boolean> { return rereadConflictWindow(this.queueDeps(), key); }

  // Everything a rollback means for memory, in @memory/reverse: the rows a mutation invalidated, the
  // artifacts derived from them, and the three stores that keep their own version history.
  rollbackFromMessage(messageId: number, boundary: number) {
    this.patch(reverseMemoryState(this.state, messageId, boundary), false);
  }

  recordVerifyDrops(drops: VerifyDrop[]) { if (drops.length) this.patch({ verifyDrops: [...this.state.verifyDrops, ...drops].slice(-VERIFY_DROP_LIMIT) }, false); }

  /** A quarantined row the author restates: their claim now, not a read of a message that is gone. */
  async reconfirmMemoryEntry(id: string) { return await reconfirmMemoryEntry(this.queueDeps(), id, new Date().toISOString()); }

  /** Rows an older chat pinned carry no envelope: the author is asked once per chat what a pin means. */
  async dismissLegacyPinPrompt() { await this.commit(() => ({ legacyPinPromptSeen: true })); }

  /** The author overrules the judge's drop. One of the queue's own decisions (see memoryQueue). */
  async storeDroppedEntry(entryId: string) { return await storeDroppedEntry(this.queueDeps(), entryId, new Date().toISOString()); }

  // --- canon -------------------------------------------------------------

  getCanon(): string {
    const canon = this.state.canon;
    if (canon?.text && !canon.stale) return canon.text;
    const story = this.deps.getStory();
    const state = this.deps.getState();
    if (!story || !state) return "";
    return getCanonLite(story, state.visitedAnchors, this.deps.getFiredTransitions(), this.getFacts());
  }

  /** v2.3 plan 05: a decided conflict or a rollback was built from a claim this text still asserts.
   *  The text is kept (an author can read it) but its readers stop treating it as current. */
  canonStale(): boolean { return this.state.canon?.stale === true; }

  /** The blackboard's envelope for every bound quality, keyed the way a bound conflict side is named
   *  (`entity|field`), so a consumer reading a bound row can cite the blackboard as its source. */
  boundProvenance(): Record<string, Provenance> {
    const board = this.deps.getState()?.blackboard;
    return boundProvenance(boundValuesFor(this.ledgerBindings(), board?.values ?? {}, board?.versions ?? {}));
  }

  // Canon-lite is prompt scaffolding ("Anchor cp1: …", "Gate a -> b"): fine for the memory model,
  // never for the player, which takes the synthesized prose or nothing.
  getCanonProse(): string { return this.canonStale() ? "" : canonHistory(this.state.canon?.text ?? ""); }

  async regenerateCanon(force = false): Promise<boolean> {
    const story = this.deps.getStory();
    if (!story || !this.enabled || this.canonInFlight) return false;
    const arcSummaries = resolvedArcs(this.state.arcs).map((arc) => arc.summary).filter((summary): summary is string => Boolean(summary));
    if (!arcSummaries.length) return false;
    const facts = this.highImportanceFacts(30).map((entry) => entry.text);
    const active = story.checkpointById[this.deps.getState()?.activeCheckpointId ?? ""];
    const checkpoint = active ? { id: active.id, name: active.name, objective: active.objective } : null;
    const inputHash = canonInputHash(arcSummaries, facts, checkpoint);
    // Stale rebuilds even when the hash matches: the validity change it saw is invisible to the hash.
    if (!force && !this.state.canon?.stale && this.state.canon?.inputHash === inputHash) return false;
    // No window: the canon is synthesised from arc summaries and facts, not from a span of the
    // transcript, so an ordinary edit must not discard it. Chat, story, version and epoch still do.
    const run = beginRun(this.deps.ownership);
    this.canonInFlight = true;
    try {
      const settings = this.deps.getExtractionSettings();
      const text = await callExtractionModel(buildCanonSummaryPrompt(story.title, arcSummaries, facts, checkpoint), {
        profileId: settings.profileId,
        debugResponse: globalThis.storyOrchestratorDebugCanonResponse ?? null,
      });
      const trimmed = stripChannelNoise(text);
      if (!trimmed || !run.stillOwns()) return false;
      const arcs = resolvedArcs(this.state.arcs);
      const sourceFacts = this.highImportanceFacts(30);
      const sources: CanonSource[] = [...sourceFacts.map((entry) => ({ store: "memory" as const, id: entry.id, ...(entry.provenance ? { provenance: entry.provenance } : {}) })), ...arcs.map((arc) => ({ store: "memory" as const, id: arc.id }))];
      this.record({ kind: "canon", inputs: sources.map((source) => source.id) });
      this.patch({
        canon: {
          text: trimmed,
          inputHash,
          updatedAt: new Date().toISOString(),
          stale: false,
          // The prose cannot carry envelopes sentence by sentence, so what a reader can check is what
          // it was built from — recorded as it was at the moment of synthesis.
          sources: sources,
        },
      });
      await this.save();
      return true;
    } finally {
      // Deliberately NOT guarded. This flag is this runtime's own in-flight bookkeeping, not
      // chat state; leaving it set because the world moved would wedge canon regeneration for
      // the rest of the session. A `finally` that releases something the run itself took is the
      // one kind of post-await write that must always run.
      this.canonInFlight = false;
    }
  }

  // --- epistemic / ledger ------------------------------------------------

  applyEpistemic(signals: ParsedEpistemicSignal[], messageId: number, retireIds: string[] = []) {
    const kept = dropCommonKnowledge(signals, enabledCharacterNames(this.deps.getStory()));
    const applied = applyEpistemicSignals(this.state.epistemic, kept, { boundary: this.boundaryStamp(), messageId }, retireIds);
    // v2.3 plan 05: refresh here too, or a pass that lapses after this write injects the member an empty block.
    this.patch({ epistemic: capEpistemic(applied.entries) }); this.updateInjection();
  }

  applyLedger(signals: ParsedLedgerSignal[], messageId: number) {
    const applied = applyLedgerSignals(this.state.ledger, signals, buildBoundKeySet(this.ledgerBindings()), { boundary: this.boundaryStamp(), messageId });
    this.patch({ ledger: capLedger(applied, undefined, undefined, this.deps.historyFloor?.() ?? null) }); this.updateInjection();
  }

  activeEpistemic(): EpistemicEntry[] {
    return activeEpistemic(this.state.epistemic);
  }

  getEpistemic(): EpistemicEntry[] {
    return this.state.epistemic;
  }

  getLedger(): LedgerView[] {
    const state = this.deps.getState();
    if (!state) return [];
    return buildLedgerView(this.state.ledger, this.ledgerBindings(), state.blackboard.values, state.blackboard.versions);
  }

  getEpistemicBlock(): string {
    const story = this.deps.getStory();
    if (!story || !this.capable) return "";
    const speaker = activeSpeakerId(story);
    const names = speaker ? namesForRosterId(story, speaker) : enabledCharacterNames(story);
    return renderPrivateEpistemicBlock(this.state.epistemic, names);
  }

  /** What ST's next prompt ACTUALLY holds, not a re-render for whoever speaks next (in a group the
   *  applied block belongs to the DRAFTED member — see the 2026-09-22 note in the plan-05 record). */
  getAppliedEpistemicBlock(): string { return readInjectedPromptBlocks().find((block) => block.key === EPISTEMIC_INJECTION_KEY)?.value ?? ""; }

  getLedgerBlock(): string { return !this.deps.getStory() || !this.enabled ? "" : renderLedgerBlock(this.getLedger()); }

  async setEpistemicPinned(id: string, pinned: boolean) { await this.commit(() => ({ epistemic: setEpistemicPinned(this.state.epistemic, id, pinned) })); }

  async removeEpistemicEntry(id: string) { await this.commit(() => ({ epistemic: removeEpistemic(this.state.epistemic, id) })); }

  async setLedgerPinned(id: string, pinned: boolean) { await this.commit(() => ({ ledger: setLedgerPinned(this.state.ledger, id, pinned) })); }

  async removeLedgerEntry(id: string) { await this.commit(() => ({ ledger: removeLedger(this.state.ledger, id) })); }

  // --- injection ---------------------------------------------------------

  private buildScoreContext(): ScoreContext {
    return buildScoreContext({
      boundary: this.boundaryStamp(),
      rosterNames: this.deps.getStory()?.roster.map(rosterMemberName) ?? [],
      openArcs: this.enabled ? openArcTexts(this.state.arcs, ARC_OPEN_INJECT_LIMIT) : [],
      weights: this.state.settings.scoreWeights,
    });
  }

  private injectionOptions() {
    return { tokenBudgets: this.state.settings.tierTokenBudgets, scoreContext: this.buildScoreContext() };
  }

  updateInjection() {
    const story = this.deps.getStory();
    if (!story || !this.enabled) {
      clearAllMemoryInjection();
      this.stagedPrivate.clear();
      if (this.state.pinnedOverflow) this.patch({ pinnedOverflow: 0 });
      return;
    }
    const options = this.injectionOptions();
    const speaker = activeSpeakerId(story);
    const pinnedOverflow = applyMemoryInjection(this.state.entries, speaker, this.state.settings.injectionDepths, options);
    if (pinnedOverflow !== this.state.pinnedOverflow) this.patch({ pinnedOverflow });

    const state = this.deps.getState();
    const values = state?.blackboard.values ?? {};
    const versions = state?.blackboard.versions ?? {};
    applyLedgerInjection(renderLedgerBlock(buildLedgerView(this.state.ledger, this.ledgerBindings(), values, versions)), LEDGER_INJECTION_DEPTH);

    this.stagedPrivate.clear();
    if (this.capable) {
      for (const id of enabledCharacterIds(story)) {
        const facts = buildMemoryInjectionBlocks(this.state.entries, id, options).facts;
        const epistemic = renderPrivateEpistemicBlock(this.state.epistemic, namesForRosterId(story, id));
        this.stagedPrivate.set(id, { facts, epistemic });
      }
      // A group has no speaker between drafts: whatever holds the prompt at rest (impersonate, quiet
      // generations, other extensions) must not carry the last drafted member's private knowledge.
      const speakerBlock = getActiveGroup() ? "" : speaker ? (this.stagedPrivate.get(speaker)?.epistemic ?? "") : renderPrivateEpistemicBlock(this.state.epistemic, enabledCharacterNames(story));
      applyEpistemicInjection(speakerBlock, EPISTEMIC_INJECTION_DEPTH);
    } else {
      clearEpistemicInjection();
    }
  }

  private setPrivateInjectionBlocks(facts: string, epistemic: string) {
    applyEpistemicInjection(epistemic, EPISTEMIC_INJECTION_DEPTH);
    const factsKey = memoryExtensionKey("facts");
    if (facts) setStoryExtensionPrompt(factsKey, facts, this.state.settings.injectionDepths.facts);
    else clearStoryExtensionPrompt(factsKey);
  }

  // Impersonate writes as the player and quiet generations serve other tools, even when ST drafted
  // a member for them: neither may read a character's private knowledge.
  withholdPrivateKnowledge() {
    clearEpistemicInjection();
  }

  onMemberDrafted(chId: number | [number]) {
    const story = this.deps.getStory();
    if (!story || !this.capable) return;
    const numericId = typeof chId === "number" ? chId : Array.isArray(chId) ? chId[0] : undefined;
    const name = getCharacterNameById(numericId);
    const rosterId = name ? rosterIdForName(story, name) : null;
    const staged = rosterId ? this.stagedPrivate.get(rosterId) : undefined;
    if (!staged) {
      this.setPrivateInjectionBlocks(buildMemoryInjectionBlocks(this.state.entries, activeSpeakerId(story), this.injectionOptions()).facts, "");
      return;
    }
    this.setPrivateInjectionBlocks(staged.facts, staged.epistemic);
  }

  getInjectionBlocks(): Record<MemoryTier, string> {
    const story = this.deps.getStory();
    const entries = story && this.enabled ? this.state.entries : [];
    return buildMemoryInjectionBlocks(entries, activeSpeakerId(story), this.injectionOptions());
  }

  // --- consolidation -----------------------------------------------------

  async runConsolidation(): Promise<{ dropped: number; superseded: number; confirmed: number; uncertain: UncertainPair[] }> {
    const summary = { dropped: 0, superseded: 0, confirmed: 0, uncertain: [] as UncertainPair[] };
    if (!this.deps.getStory() || !this.enabled || this.consolidationInFlight || this.state.backfill?.running) return summary;
    const run = beginRun(this.deps.ownership);
    this.consolidationInFlight = true;
    try {
      const supersededWinnerIds = new Set<string>();
      const groupOf = () => {
        const active = this.state.entries.filter((entry) => !entry.supersededBy && !entry.foldedInto && isLive(entry));
        const groups = new Map<string, MemoryEntry[]>();
        active.forEach((entry) => {
          const key = `${entry.tier}:${entry.characterId ?? "shared"}`;
          groups.set(key, [...(groups.get(key) ?? []), entry]);
        });
        return groups;
      };
      const judge = this.deps.judge?.() ?? null;
      const judged = judge?.active("memoryPairs") ? judge : null;
      for (const group of groupOf().values()) {
        if (group.length < CONSOLIDATION_MIN_GROUP) continue;
        const matches = await buildMatchSets(group);
        const wider = judged ? await buildMatchSets(group, { ...DEFAULT_DEDUP_THRESHOLDS, jaccardSameTopic: PAIR_JACCARD_FLOOR }) : matches;
        const judgedResult = judged ? consolidateTierJudged(group, wider, await judgePairRelations(judged, group, wider, matches)) : null;
        // Three awaits per group (two embedding passes and a judge pass), then writes that DROP and
        // supersede entries: destructive, so a run outliving its chat would delete another chat's
        // memory. The check is inside the loop because each group is its own write.
        if (!run.stillOwns()) break;
        const result = judgedResult ?? consolidateTier(group, matches);
        if (judgedResult?.clearedIds.length) this.patch(clearContradicted(this.state, judgedResult.clearedIds), false);
        summary.uncertain.push(...result.uncertain);
        result.supersededPairs.forEach((pair) => supersededWinnerIds.add(pair.winnerId));
        if (!result.droppedIds.length && !result.supersededPairs.length && !result.confirmedIds.length) continue;
        // Dated at THIS pass's point, never the winner's message: a rollback has to undo the retirement this pass made.
        const consolidated = applyConsolidation(this.state, result, { boundary: this.boundaryStamp(), messageId: this.deps.getState()?.lastMessageId ?? -1 });
        // A dedup is the one artifact whose output is a DELETION, so the losers travel with the record.
        this.record({ kind: "dedup", inputs: [...result.confirmedIds, ...result.supersededPairs.map((pair) => pair.winnerId)], removed: disappearingEntries(this.state.entries, consolidated.entries) });
        this.patch(consolidated);
        summary.dropped += result.droppedIds.length;
        summary.superseded += result.supersededPairs.length;
        summary.confirmed += result.confirmedIds.length;
      }
      if (summary.uncertain.length) this.patch(markContradicted(this.state, summary.uncertain), false);
      // A pair the walk could not decide is a candidate for the queue; the queue itself compares the
      // stores, which is what makes a conflict a conflict. Its RESULT decides whether there is
      // anything to save — a queued pair is a store change like any other.
      const queued = this.detectMemoryConflicts();
      if (summary.dropped || summary.superseded || summary.confirmed || summary.uncertain.length || queued.length) {
        this.updateInjection();
        await this.save();
      }
      if (supersededWinnerIds.size) {
        await this.runSupersessionBridge(this.state.entries.filter((entry) => supersededWinnerIds.has(entry.id)));
      }
      await this.syncWorldInfo();
      await this.regenerateCanon();
      return summary;
    } finally {
      this.consolidationInFlight = false;
    }
  }

  async runSupersessionBridge(supersedingEntries: MemoryEntry[]): Promise<boolean> {
    const story = this.deps.getStory();
    const state = this.deps.getState();
    if (!story || !state || !supersedingEntries.length) return false;
    const scope = deriveScope(story, state.activeCheckpointId, state.blackboard, this.deps.getExpansionGateSources());
    if (!scope.length) return false;
    const run = beginRun(this.deps.ownership);
    const messages = supersedingEntries.map((entry, index) => ({
      index,
      messageId: entry.messageId ?? state.boundary,
      speaker: "narration",
      text: entry.text,
    }));
    const window: SharedReadWindow = { from: messages[0].messageId, to: messages[messages.length - 1].messageId, messages };
    const result = await runSharedRead({
      story,
      state,
      priority: 1,
      reason: "supersede:bridge",
      window,
      scope,
      firedTransitions: this.deps.getFiredTransitions(),
      facts: this.getFacts(),
      client: { ...this.deps.getExtractionSettings(), debugResponse: globalThis.storyOrchestratorDebugSupersessionResponse ?? null },
    });
    if (!result.audit.acceptedDeltas.length || !run.stillOwns()) return false;
    this.deps.enqueueExtractorDeltas(result.audit.acceptedDeltas, result.audit.window);
    await this.save();
    return true;
  }

  // --- world info --------------------------------------------------------

  async syncWorldInfo(): Promise<MemoryMirrorSummary> {
    const story = this.deps.getStory();
    if (!story || !this.enabled) return emptyMirrorSummary();
    const host = { getChatId: () => getContext().chatId ?? null, ensureLorebook, loadLorebook, upsertWIEntry, disableWIEntry, bindChatLorebook, ownership: this.deps.ownership };
    const result = await syncMemoryMirror({ title: story.title, entries: this.state.entries, writes: this.state.wiWrites, book: this.state.wiBook }, host);
    if (!result) return emptyMirrorSummary();
    if (result.changed) {
      this.patch({ wiWrites: result.writes, wiBook: result.book }, false);
      await this.save();
    }
    return result.summary;
  }
}
