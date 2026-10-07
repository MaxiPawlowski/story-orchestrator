import { progressQualityForAnchor, type BlackboardDelta, type EngineState, type NormalizedStoryV2, type NormalizedTransition } from "@engine/index";
import { maxTokensForInput } from "@extraction/callBudget";
import { askText } from "@extraction/modelRoute";
import { stripChannelNoise } from "@extraction/parse";
import { deriveScope } from "@extraction/scope";
import { runSharedRead } from "@extraction/sharedRead";
import type { ExtraGateSource, ModelCall, ParsedDelta, ParsedFact, SharedReadWindow } from "@extraction/index";
import {
  activeEpistemic, addMemoryEntries, applyArcSignals, applyConsolidation, applyEpistemicSignals, applyLedgerSignals,
  ARC_OPEN_INJECT_LIMIT, buildArcSummaryPrompt, buildBoundKeySet, capAllTiers, capEpistemic, capLedger,
  highImportanceFacts, isLive, ledgerBindings, ledgerEntityList, storyEntities, disappearingEntries, recordDerived,
  reverseMemoryState, dropCommonKnowledge, capOpenArcs, capResolvedArcs, CONSOLIDATION_MIN_GROUP, consolidateTier,
  DEFAULT_DEDUP_THRESHOLDS, editEntryText, expireScoped, matchArcBridges, openArcTexts, withoutExcludedThreads, removeArc, removeEpistemic,
  removeLedger, restoreEntry, setArcPinned, setLocked, setArcSummary, setEpistemicPinned, setLedgerPinned, setPinned,
  type ArcEntry, type DerivedRecord, type EpistemicEntry, type LedgerBinding, type LedgerView, type MemoryEntry,
  type MemoryTier, type ParsedArcSignal, type ParsedEpistemicSignal, type ParsedLedgerSignal, type UncertainPair,
  consolidateTierJudged, clearContradicted, sceneRangeFrom, rollingShortTerm, type ShortTermPlacement, innerRender,
} from "@memory/index";
import { PAIR_JACCARD_FLOOR, type SceneReadRecord } from "@judge/index";
import type { Provenance } from "@memory/provenance";
import { sceneConflictValues } from "@memory/conflicts";
import { MirrorSync, type MemoryMirrorSummary } from "../memoryMirror";
import { MemoryInjector } from "../memoryInjector";
import { CanonSynthesis } from "../canonSynthesis";
import { ChapterPort, chapterKit } from "../chapterPort";
import { buildMatchSets, judgePairRelations } from "../consolidationMatches";
import { boundProvenance, boundValuesFor, MemoryQueue } from "../memoryQueue";
import type { JudgeRuntime } from "../judge";
import { beginRun, type RunGuard, type RunOwnership } from "../runToken";
import type { MemoryHosts } from "../hostPorts";
import { computeEntryTokens, fitEntryToBlock, tokensFor } from "../entryTokens";
import { lastPlayerRow } from "../playerTurn";
import { enabledCharacterNames, rosterMemberName } from "../roster";
import { VERIFY_DROP_LIMIT, type MemoryBackfillState, type MemoryRuntimeState, type VerifyDrop } from "../types";
import { required } from "@utils/guards";

export interface MemoryCoordinatorDeps {
  getStory: () => NormalizedStoryV2 | null;
  getState: () => EngineState | null;
  getMemory: () => MemoryRuntimeState;
  setMemory: (next: MemoryRuntimeState) => void;
  model: ModelCall;
  getFiredTransitions: () => NormalizedTransition[];
  getExpansionGateSources: () => ExtraGateSource[];
  enqueueExtractorDeltas: (accepted: ParsedDelta[], window: { from: number; to: number }, origin: string) => void;
  enqueueMechanical: (deltas: BlackboardDelta[]) => void;
  judge?: () => JudgeRuntime | null;
  persist: () => Promise<void>;
  /** Whether the last save is still unwritten — the plan-06 save evidence. A queue
   *  decision reads it because `persist` cannot answer the question itself (see `memoryQueue`). */
  unsaved?: () => boolean;
  notify: () => void;
  ownership: RunOwnership;
  historyFloor?: () => number | null;
  /** The stored scene read, whose claims the ledger and the blackboard can contradict. */
  getScene?: () => SceneReadRecord | null;
  /** Read a named span again, rather than whatever the transcript now ends with. */
  rereadWindow?: (window: { from: number; to: number }, reason: string) => Promise<unknown>;
  hosts: MemoryHosts;
  beatFor?: (rosterId: string) => string;
  meanwhile?: (rosterId: string) => string[];
  journal?: (summary: string, note: string) => void;
  chapterHost?: { closeScene: (to: number) => Promise<void>; announce: (text: string) => Promise<void>; journal: (summary: string, detail?: string) => void; playerName: () => string };
}

// Owns everything that reads or writes extras.memory: tiers, arcs, canon, epistemic, ledger,
// consolidation, World Info mirroring and prompt injection. The manager keeps the persist
// boundary — this class only mutates the slice and asks for a save.
const lastPlayerName = (rows: unknown[]): string => {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index] as { is_user?: unknown; name?: unknown } | null;
    if (row?.is_user === true && typeof row.name === "string" && row.name.trim()) return row.name.trim();
  }
  return "";
};

export class MemoryCoordinator {
  readonly injector: MemoryInjector = new MemoryInjector({
    getStory: () => this.deps.getStory(),
    getState: () => this.deps.getState(),
    memory: () => this.state,
    enabled: () => this.enabled,
    capable: () => this.capable,
    ledgerBindings: () => this.ledgerBindings(),
    setPinnedOverflow: (count) => this.patch({ pinnedOverflow: count }),
    hosts: () => this.deps.hosts,
    beatFor: (rosterId) => this.deps.beatFor?.(rosterId) ?? "",
    chapters: () => this.chapters,
    ledgerFocus: () => this.ledgerFocus(),
    meanwhile: (rosterId) => this.deps.meanwhile?.(rosterId) ?? [],
  });
  readonly canon = new CanonSynthesis({
    getStory: () => this.deps.getStory(), getState: () => this.deps.getState(), memory: () => this.state,
    patch: (next) => this.patch(next), record: (input) => this.record(input), save: () => this.save(),
    model: () => this.deps.model, ownership: () => this.deps.ownership, enabled: () => this.enabled,
    firedTransitions: () => this.deps.getFiredTransitions(), facts: () => this.getFacts(),
    restingEntries: (entries) => this.injector.restingEntries(entries), restingLines: (text) => this.injector.restingLines(text),
    journal: (summary, note) => this.deps.journal?.(summary, note),
  });
  readonly chapters: ChapterPort;
  private consolidationInFlight = false;
  readonly mirror = new MirrorSync({
    title: () => (this.enabled ? this.deps.getStory()?.title ?? null : null),
    input: () => ({ entries: this.injector.restingEntries(this.state.entries), writes: this.state.wiWrites, book: this.state.wiBook }),
    host: () => ({ ...this.deps.hosts.mirror, getChatId: this.deps.hosts.chat.chatId, ownership: this.deps.ownership }),
    commit: (writes, book) => { this.patch({ wiWrites: writes, wiBook: book }, false); return this.save(); },
  });
  readonly queue: MemoryQueue;

  constructor(private readonly deps: MemoryCoordinatorDeps) {
    this.chapters = new ChapterPort({
      coordinator: this, deps, memory: () => this.state, patch: (next) => this.patch(next), record: (input) => this.record(input), save: () => this.save(),
    });
    const board = () => this.deps.getState()?.blackboard;
    this.queue = new MemoryQueue({
      getMemory: () => this.state, patch: (next, touch) => this.patch(next, touch), boundaryStamp: () => this.boundaryStamp(),
      boundValues: () => boundValuesFor(this.ledgerBindings(), board()?.values ?? {}, board()?.versions ?? {}),
      sceneValues: () => sceneConflictValues(this.deps.getScene?.()), lastMessageId: () => this.deps.getState()?.lastMessageId ?? -1,
      updateInjection: () => this.updateInjection(), unsaved: () => this.deps.unsaved?.() ?? false, save: () => this.save(),
      // A decided disagreement changes what a canon synthesis would have been built from, so the text
      // derived from the losing claim stops being read until the next pass replaces it.
      invalidateCanon: () => { if (this.state.canon && !this.state.canon.stale) this.patch({ canon: { ...this.state.canon, stale: true } }, false); },
      ...(deps.rereadWindow ? { reread: (window: { from: number; to: number }, reason: string) => required(deps.rereadWindow, "rereadWindow")(window, reason) } : {}),
      run: () => beginRun(this.deps.ownership), matchSets: (group) => buildMatchSets(this.deps.hosts.vectors, group),
    });
  }

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

  // What this write derived, what it was built from, and what it took away. Recorded
  // with the write, so a rollback past the input can drop the artifact and restore the removal.
  private record(input: Omit<DerivedRecord, "id" | "boundary" | "messageId"> & { messageId?: number }) {
    const state = this.deps.getState();
    this.patch({ derived: recordDerived(this.state.derived, { boundary: state?.boundary ?? 0, messageId: state?.lastMessageId ?? -1, ...input }) }, false);
  }

  get enabled(): boolean {
    return this.state.settings.enabled;
  }

  get harvestsReasoning(): boolean { return this.capable && this.state.settings.harvestReasoning === true; }

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
    return this.state.entries.filter((entry) => isLive(entry)).filter((entry) => entry.tier === "facts").map((entry) => ({ text: entry.text,
        evidence: entry.evidence, importance: entry.importance, boundary: entry.createdAt,
        messageId: entry.messageId }));
  }

  // --- tiers -------------------------------------------------------------

  async applyEntries(entries: MemoryEntry[], window: { from: number; to: number }) {
    if (!this.enabled || !entries.length) return;
    // The token count is a host call, so this write is an await past the caller's own check.
    const run = beginRun(this.deps.ownership, window);
    await computeEntryTokens(this.deps.hosts.tokens, entries);
    const held = await this.queue.findHeld(entries);
    if (!run.stillOwns()) return;
    const written = addMemoryEntries(this.state, entries, window);
    this.patch(capAllTiers(written.state, this.state.settings.tierBudgets));
    this.queue.hold(held);
  }

  async addSceneSummary(entry: MemoryEntry, window: { from: number; to: number }): Promise<number | null> {
    const run = beginRun(this.deps.ownership, window);
    await computeEntryTokens(this.deps.hosts.tokens, [entry]);
    if (!run.stillOwns()) return null;
    const written = addMemoryEntries(this.state, entry.text ? [entry] : [], window);
    const capped = capAllTiers(expireScoped(written.state, "scene"), this.state.settings.tierBudgets);
    const sceneOccurrence = this.state.sceneCount + 1;
    const removed = disappearingEntries(this.state.entries, capped.entries);
    this.patch({ ...capped, sceneCount: sceneOccurrence });
    this.record({ kind: "scene_summary", inputs: [], outputId: written.accepted[0]?.id, range: window, removed, messageId: window.to });
    return sceneOccurrence;
  }

  async replaceShortTerm(entry: MemoryEntry, window: { from: number; to: number }, place: ShortTermPlacement = rollingShortTerm) {
    const run = beginRun(this.deps.ownership, window);
    await computeEntryTokens(this.deps.hosts.tokens, [entry]);
    await fitEntryToBlock(this.deps.hosts.tokens, entry, this.state.settings.tierTokenBudgets.short_term);
    if (!run.stillOwns()) return;
    const limits = () => ({ rows: this.state.settings.tierBudgets.short_term, tokens: this.state.settings.tierTokenBudgets.short_term });
    const { entries, inputs } = place(this.state.entries, entry, limits);
    this.record({ kind: "short_term", inputs, outputId: entry.id,
        range: window, removed: disappearingEntries(this.state.entries, entries), messageId: window.to });
    this.patch({ entries, shortTermSummaryEnd: window.to });
  }

  shortTermEntry(): MemoryEntry | undefined {
    return this.state.entries.find((entry) => entry.tier === "short_term");
  }

  sceneStart(to: number): number { return sceneRangeFrom(this.state.derived, to, this.state.storyStart); }

  markStoryStart() { this.patch({ storyStart: lastPlayerRow(this.deps.hosts.chat.chatRows()) }, false); }

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

  /** Lock freezes the story's truth: no pass may retire it, and a contradiction is queued. */
  async setMemoryLocked(id: string, locked: boolean) { await this.commit(() => setLocked(this.state, id, locked, new Date().toISOString(), this.boundaryStamp())); }

  async restoreMemoryEntry(entry: MemoryEntry) { await this.commit(() => restoreEntry(this.state, entry)); }

  async editMemoryEntry(id: string, text: string) {
    const run = beginRun(this.deps.ownership);
    await this.commit(() => editEntryText(this.state, id, text, new Date().toISOString(), this.boundaryStamp()));
    const tokens = await tokensFor(this.deps.hosts.tokens, text);
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
    return this.deps.getStory() && this.enabled ? openArcTexts(withoutExcludedThreads(this.state.arcs, this.state.derived), ARC_OPEN_INJECT_LIMIT) : [];
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
    const sceneSummaries = this.state.entries.filter((entry) => entry.tier === "scene_history").slice(-5).map((entry, index) => `Scene ${index + 1}: ${entry.text}`).join("\n");
    const memories = highImportanceFacts(this.state.entries, 20).map((entry) => `[${entry.type}] ${entry.text}`).join("\n");
    // One await and one write PER ARC, which is why the guard is a handle rather than a wrapper:
    // the check belongs inside the loop, immediately before each write, not around the whole pass.
    // Without it a five-arc pass that outlives a chat switch writes the remaining four into the
    // new chat.
    const run = beginRun(this.deps.ownership);
    let changed = false;
    for (const id of arcIds) {
      const arc = this.state.arcs.find((candidate) => candidate.id === id);
      if (!arc || arc.status !== "resolved" || arc.summary) continue;
      const prompt = buildArcSummaryPrompt(arc.text, sceneSummaries, memories);
      const summary = await askText(this.deps.model, prompt, { role: "synthesis", pass: "arcSummary", maxTokens: maxTokensForInput("arcSummary", prompt), signal: run.signal, refuseIncomplete: true });
      if (!run.stillOwns()) break;
      const trimmed = stripChannelNoise(summary);
      if (!trimmed) continue;
      this.record({ kind: "arc_summary", inputs: [id] });
      this.patch({ arcs: setArcSummary(this.state.arcs, id, trimmed) });
      changed = true;
    }
    if (changed) {
      await this.canon.regenerateCanon();
      await this.save();
    }
    return changed;
  }

  // Everything a rollback means for memory, in @memory/reverse: the rows a mutation invalidated, the
  // artifacts derived from them, and the three stores that keep their own version history.
  rollbackFromMessage(messageId: number, boundary: number) {
    this.patch(reverseMemoryState(this.state, messageId, boundary, chapterKit()?.unfoldAt), false);
  }

  recordVerifyDrops(drops: VerifyDrop[]) { if (drops.length) this.patch({ verifyDrops: [...this.state.verifyDrops, ...drops].slice(-VERIFY_DROP_LIMIT) }, false); }

  /** The blackboard's envelope for every bound quality, keyed the way a bound conflict side is named
   *  (`entity|field`), so a consumer reading a bound row can cite the blackboard as its source. */
  boundProvenance(): Record<string, Provenance> {
    const board = this.deps.getState()?.blackboard;
    return boundProvenance(boundValuesFor(this.ledgerBindings(), board?.values ?? {}, board?.versions ?? {}));
  }

  // --- epistemic / ledger ------------------------------------------------

  applyEpistemic(signals: ParsedEpistemicSignal[], messageId: number, retireIds: string[] = [], window?: { from: number; to: number }) {
    const inner = innerRender();
    const story = this.deps.getStory();
    const common = dropCommonKnowledge(signals, enabledCharacterNames(story, this.deps.hosts.roster), this.state.epistemic);
    const kept = inner && window
      ? inner.admitIntents(common, inner.intentEvidence(this.deps.hosts.chat.chatWindow(window.from, window.to).messages, story?.requirements?.personas ?? []))
      : common.filter((signal) => signal.tag !== "intends");
    const applied = applyEpistemicSignals(this.state.epistemic, kept, { boundary: this.boundaryStamp(), messageId }, retireIds);
    const held = this.injector.heldSecretsKey();
    // Refresh here too, or a pass that lapses after this write injects the member an empty block.
    this.patch({ epistemic: capEpistemic(inner ? inner.capIntents(applied.entries) : applied.entries) }); this.updateInjection();
    if (this.state.wiBook && this.injector.heldSecretsKey() !== held) void this.syncWorldInfo(beginRun(this.deps.ownership));
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

  private ledgerFocus(): string[] {
    const scene = this.deps.getScene?.() ?? null;
    const story = this.deps.getStory();
    const checkpoint = story?.checkpointById[this.deps.getState()?.activeCheckpointId ?? ""];
    const player = lastPlayerName(this.deps.hosts.chat.chatRows());
    return [
      ...(scene?.present ?? []).map((member) => member.name),
      ...(scene?.location?.value ? [scene.location.value] : []),
      ...(player ? [player] : []),
      ...(checkpoint ? [checkpoint.name, checkpoint.objective ?? ""] : []),
    ].filter(Boolean);
  }

  getLedger(): LedgerView[] { return this.injector.ledgerView(); }
  getEpistemicBlock(): string { return this.injector.epistemicBlock(); }
  getAppliedEpistemicBlock(): string { return this.injector.appliedEpistemicBlock(); }
  getLedgerBlock(): string { return this.injector.ledgerBlock(); }

  async setEpistemicPinned(id: string, pinned: boolean) { await this.commit(() => ({ epistemic: setEpistemicPinned(this.state.epistemic, id, pinned) })); }

  async removeEpistemicEntry(id: string) { await this.commit(() => ({ epistemic: removeEpistemic(this.state.epistemic, id) })); }

  async setLedgerPinned(id: string, pinned: boolean) { await this.commit(() => ({ ledger: setLedgerPinned(this.state.ledger, id, pinned) })); }

  async removeLedgerEntry(id: string) { await this.commit(() => ({ ledger: removeLedger(this.state.ledger, id) })); }

  // injection (rendered by MemoryInjector) --------------------------

  updateInjection() { this.injector.update(); }
  releasePrivateInjection() { this.injector.releaseDraft(); this.injector.update(); }
  releaseStaleHold() { if (this.injector.releaseWithhold()) this.injector.update(); }
  withholdPrivateKnowledge() { this.injector.withholdPrivateKnowledge(); }
  onMemberDrafted(chId: number | [number]) { this.injector.onMemberDrafted(chId); }
  draftedRosterId(chId: number | [number]): string | null { return this.injector.draftedRosterId(chId); }
  getInjectionBlocks(): Record<MemoryTier, string> { return this.injector.blocks(); }

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
        const matches = await buildMatchSets(this.deps.hosts.vectors, group);
        const wider = judged ? await buildMatchSets(this.deps.hosts.vectors, group, { ...DEFAULT_DEDUP_THRESHOLDS, jaccardSameTopic: PAIR_JACCARD_FLOOR }) : matches;
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
        const removed = disappearingEntries(this.state.entries, consolidated.entries);
        this.patch(consolidated);
        this.record({ kind: "dedup", inputs: [...result.confirmedIds, ...result.supersededPairs.map((pair) => pair.winnerId)], removed });
        summary.dropped += result.droppedIds.length;
        summary.superseded += result.supersededPairs.length;
        summary.confirmed += result.confirmedIds.length;
      }
      this.queue.settle(summary.uncertain);
      // A pair the walk could not decide is a candidate for the queue; the queue itself compares the
      // stores, which is what makes a conflict a conflict. Its RESULT decides whether there is
      // anything to save — a queued pair is a store change like any other.
      const queued = this.queue.detectMemoryConflicts();
      if (summary.dropped || summary.superseded || summary.confirmed || summary.uncertain.length || queued.length) {
        this.updateInjection();
        await this.save();
      }
      if (supersededWinnerIds.size) {
        await this.runSupersessionBridge(this.state.entries.filter((entry) => supersededWinnerIds.has(entry.id)));
      }
      await this.syncWorldInfo();
      await this.canon.regenerateCanon();
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
      speaker: "narration", isUser: false,
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
      deltasOnly: true,
      model: this.deps.model,
      ask: { role: "read", pass: "supersession" },
    });
    if (!result.audit.acceptedDeltas.length || !run.stillOwns()) return false;
    this.deps.enqueueExtractorDeltas(result.audit.acceptedDeltas, result.audit.window, result.audit.id);
    await this.save();
    return true;
  }

  // --- world info --------------------------------------------------------

  syncWorldInfo(owner?: RunGuard): Promise<MemoryMirrorSummary> { return this.mirror.sync(owner); }
}
