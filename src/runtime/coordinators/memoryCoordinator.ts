import { progressQualityForAnchor, type BlackboardDelta, type EngineState, type NormalizedStoryV2, type NormalizedTransition } from "@engine/index";
import { callExtractionModel, deriveScope, getCanonLite, runSharedRead, stripChannelNoise, type ExtraGateSource, type ParsedDelta, type ParsedFact, type SharedReadWindow } from "@extraction/index";
import { activeEpistemic, addMemoryEntries, applyArcSignals, dropByMessageId, rollbackArcs, rollbackEpistemic, rollbackLedger, applyConsolidation, applyEpistemicInjection, applyEpistemicSignals, applyLedgerInjection, applyLedgerSignals, applyMemoryInjection, ARC_OPEN_INJECT_LIMIT, buildArcSummaryPrompt, buildBoundKeySet, buildCanonSummaryPrompt, buildJaccardMatchSets, buildLedgerView, buildMemoryInjectionBlocks, canonHistory, canonInputHash, capAllTiers, capEpistemic, capLedger, dropCommonKnowledge, capOpenArcs, capResolvedArcs, clearAllMemoryInjection, clearEpistemicInjection, CONSOLIDATION_MIN_GROUP, consolidateTier, DEFAULT_DEDUP_THRESHOLDS, editEntryText, excludeEntry, expireScoped, markContradicted, matchArcBridges, memoryExtensionKey, openArcTexts, removeArc, removeEpistemic, removeLedger, renderLedgerBlock, renderPrivateEpistemicBlock, resolvedArcs, restoreEntry, setArcPinned, setArcSummary, setEpistemicPinned, setLedgerPinned, setPinned, type ArcEntry, type EpistemicEntry, type LedgerBinding, type LedgerView, type MatchSets, type MemoryEntry, type MemoryTier, type ParsedArcSignal, type ParsedEpistemicSignal, type ParsedLedgerSignal, type ScoreContext, type UncertainPair, consolidateTierJudged, clearContradicted } from "@memory/index";
import { bindChatLorebook, clearStoryExtensionPrompt, countTokens, DEFAULT_VECTOR_SOURCE, disableWIEntry, ensureLorebook, getActiveGroup, getCharacterNameById, getContext, loadLorebook, setStoryExtensionPrompt, upsertWIEntry, vectorInsert, vectorPurge, vectorQuery } from "@services/STAPI";
import { EPISTEMIC_INJECTION_DEPTH, LEDGER_INJECTION_DEPTH } from "@constants/defaults";
import { emptyMirrorSummary, syncMemoryMirror, type MemoryMirrorSummary } from "../memoryMirror";
import { buildMatchSets, judgePairRelations } from "../consolidationMatches";
import type { JudgeRuntime } from "../judge";
import { PAIR_JACCARD_FLOOR } from "@judge/index";
import { activeSpeakerId, enabledCharacterIds, enabledCharacterNames, namesForRosterId, rosterIdForName, rosterMemberName } from "../roster";
import { VERIFY_DROP_LIMIT, type ExtractionRuntimeSettings, type MemoryBackfillState, type MemoryRuntimeState, type VerifyDrop } from "../types";

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
  notify: () => void;
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

  private async save() {
    await this.deps.persist();
    this.deps.notify();
  }

  private boundaryStamp() {
    const state = this.deps.getState();
    return state?.boundary ?? 0;
  }

  get enabled(): boolean {
    return this.state.settings.enabled;
  }

  get capable(): boolean {
    return this.state.settings.enabled && this.state.settings.epistemicLedgerCapable;
  }

  ledgerBindings(): LedgerBinding[] {
    const story = this.deps.getStory();
    if (!story) return [];
    return Object.values(story.qualityByKey)
      .filter((quality) => quality.ledger_binding)
      .map((quality) => ({ entity: quality.ledger_binding!.entity, field: quality.ledger_binding!.field, qualityKey: quality.key }));
  }

  ledgerEntityList(): Array<{ name: string; type: string }> {
    const story = this.deps.getStory();
    if (!story) return [];
    const types = new Map<string, string>();
    for (const member of story.roster) types.set(rosterMemberName(member), "character");
    for (const binding of this.ledgerBindings()) if (!types.has(binding.entity)) types.set(binding.entity, "character");
    for (const entry of this.state.ledger) types.set(entry.entity, entry.entityType);
    return [...types].map(([name, type]) => ({ name, type }));
  }

  getEntities(): string[] {
    const story = this.deps.getStory();
    if (!story) return [];
    const names = new Set<string>();
    for (const member of story.roster) names.add(rosterMemberName(member));
    for (const binding of this.ledgerBindings()) names.add(binding.entity);
    for (const entry of this.state.ledger) names.add(entry.entity);
    return [...names].filter(Boolean);
  }

  getFacts(): ParsedFact[] {
    return this.state.entries
      .filter((entry) => entry.tier === "facts")
      .map((entry) => ({ text: entry.text, evidence: entry.evidence, importance: entry.importance, boundary: entry.createdAt, messageId: entry.messageId }));
  }

  private highImportanceFacts(limit: number): MemoryEntry[] {
    return this.state.entries
      .filter((entry) => entry.tier === "facts" && !entry.supersededBy && !entry.foldedInto && entry.importance >= 2)
      .slice(0, limit);
  }

  async computeEntryTokens(entries: MemoryEntry[]) {
    for (const entry of entries) {
      try {
        entry.tokens = await countTokens(entry.text);
      } catch {
        entry.tokens = undefined;
      }
    }
  }

  // --- tiers -------------------------------------------------------------

  async applyEntries(entries: MemoryEntry[], window: { from: number; to: number }) {
    if (!this.enabled || !entries.length) return;
    await this.computeEntryTokens(entries);
    const written = addMemoryEntries(this.state, entries, window);
    this.patch(capAllTiers(written.state, this.state.settings.tierBudgets));
  }

  async addSceneSummary(entry: MemoryEntry, window: { from: number; to: number }): Promise<number> {
    await this.computeEntryTokens([entry]);
    const written = addMemoryEntries(this.state, entry.text ? [entry] : [], window);
    const capped = capAllTiers(expireScoped(written.state, "scene"), this.state.settings.tierBudgets);
    const sceneOccurrence = this.state.sceneCount + 1;
    this.patch({ ...capped, sceneCount: sceneOccurrence });
    return sceneOccurrence;
  }

  async replaceShortTerm(entry: MemoryEntry, summaryEnd: number) {
    await this.computeEntryTokens([entry]);
    const entries = [...this.state.entries.filter((candidate) => candidate.tier !== "short_term"), entry];
    this.patch({ entries, shortTermSummaryEnd: summaryEnd });
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

  async setMemoryPinned(id: string, pinned: boolean) {
    this.patch(setPinned(this.state, id, pinned), false);
    this.updateInjection();
    await this.save();
  }

  async excludeMemoryEntry(id: string) {
    this.patch(excludeEntry(this.state, id), false);
    this.updateInjection();
    await this.save();
  }

  async restoreMemoryEntry(entry: MemoryEntry) {
    this.patch(restoreEntry(this.state, entry), false);
    this.updateInjection();
    await this.save();
  }

  async editMemoryEntry(id: string, text: string) {
    this.patch(editEntryText(this.state, id, text), false);
    this.updateInjection();
    await this.save();
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

  async setArcPinned(id: string, pinned: boolean) {
    this.patch({ arcs: setArcPinned(this.state.arcs, id, pinned) }, false);
    this.updateInjection();
    await this.save();
  }

  async removeArc(id: string) {
    this.patch({ arcs: removeArc(this.state.arcs, id) }, false);
    this.updateInjection();
    await this.save();
  }

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
    const sceneSummaries = this.state.entries
      .filter((entry) => entry.tier === "scene_history")
      .slice(-5)
      .map((entry, index) => `Scene ${index + 1}: ${entry.text}`)
      .join("\n");
    const memories = this.highImportanceFacts(20).map((entry) => `[${entry.type}] ${entry.text}`).join("\n");
    let changed = false;
    for (const id of arcIds) {
      const arc = this.state.arcs.find((candidate) => candidate.id === id);
      if (!arc || arc.status !== "resolved" || arc.summary) continue;
      const summary = await callExtractionModel(buildArcSummaryPrompt(arc.text, sceneSummaries, memories), {
        profileId: settings.profileId,
        debugResponse: globalThis.storyOrchestratorDebugArcSummaryResponse ?? null,
      });
      const trimmed = stripChannelNoise(summary);
      if (!trimmed) continue;
      this.patch({ arcs: setArcSummary(this.state.arcs, id, trimmed) });
      changed = true;
    }
    if (changed) {
      await this.regenerateCanon();
      await this.save();
    }
    return changed;
  }

  // Everything a rollback means for memory: entries dropped by message, arcs/epistemic/ledger wound
  // back, and canon invalidated when an arc that fed it is no longer resolved.
  rollbackFromMessage(messageId: number, boundary: number) {
    const resolvedBefore = new Set(this.state.arcs.filter((arc) => arc.status === "resolved").map((arc) => arc.id));
    const arcs = rollbackArcs(this.state.arcs, messageId, boundary);
    const canonStale = arcs.filter((arc) => arc.status === "resolved" && resolvedBefore.has(arc.id)).length !== resolvedBefore.size;
    this.patch({
      ...dropByMessageId(this.state, messageId),
      arcs,
      epistemic: rollbackEpistemic(this.state.epistemic, messageId),
      ledger: rollbackLedger(this.state.ledger, messageId),
      verifyDrops: this.state.verifyDrops.filter((drop) => (drop.entry.messageId ?? -1) < messageId),
      ...(canonStale ? { canon: null } : {}),
    }, false);
  }

  recordVerifyDrops(drops: VerifyDrop[]) {
    if (drops.length) this.patch({ verifyDrops: [...this.state.verifyDrops, ...drops].slice(-VERIFY_DROP_LIMIT) }, false);
  }

  async storeDroppedEntry(entryId: string) {
    const drop = this.state.verifyDrops.find((item) => item.entry.id === entryId);
    if (!drop) return false;
    this.patch({ verifyDrops: this.state.verifyDrops.filter((item) => item !== drop) }, false);
    const window = { from: drop.entry.messageId ?? 0, to: drop.entry.messageId ?? 0 };
    const written = addMemoryEntries({ ...this.state, writeLog: [] }, [{ ...drop.entry, confidence: drop.p }], window);
    this.patch({ entries: written.state.entries });
    this.updateInjection();
    await this.save();
    return true;
  }

  // --- canon -------------------------------------------------------------

  getCanon(): string {
    const canon = this.state.canon;
    if (canon?.text) return canon.text;
    const story = this.deps.getStory();
    const state = this.deps.getState();
    if (!story || !state) return "";
    return getCanonLite(story, state.visitedAnchors, this.deps.getFiredTransitions(), this.getFacts());
  }

  // Canon-lite is prompt scaffolding ("Anchor cp1: …", "Gate a -> b"): fine for the memory model,
  // never for the player. Reader surfaces take the synthesized prose or nothing.
  getCanonProse(): string {
    return canonHistory(this.state.canon?.text ?? "");
  }

  async regenerateCanon(force = false): Promise<boolean> {
    const story = this.deps.getStory();
    if (!story || !this.enabled || this.canonInFlight) return false;
    const arcSummaries = resolvedArcs(this.state.arcs).map((arc) => arc.summary).filter((summary): summary is string => Boolean(summary));
    if (!arcSummaries.length) return false;
    const facts = this.highImportanceFacts(30).map((entry) => entry.text);
    const active = story.checkpointById[this.deps.getState()?.activeCheckpointId ?? ""];
    const checkpoint = active ? { id: active.id, name: active.name, objective: active.objective } : null;
    const inputHash = canonInputHash(arcSummaries, facts, checkpoint);
    if (!force && this.state.canon?.inputHash === inputHash) return false;
    this.canonInFlight = true;
    try {
      const settings = this.deps.getExtractionSettings();
      const text = await callExtractionModel(buildCanonSummaryPrompt(story.title, arcSummaries, facts, checkpoint), {
        profileId: settings.profileId,
        debugResponse: globalThis.storyOrchestratorDebugCanonResponse ?? null,
      });
      const trimmed = stripChannelNoise(text);
      if (!trimmed) return false;
      this.patch({ canon: { text: trimmed, inputHash, updatedAt: new Date().toISOString() } });
      await this.save();
      return true;
    } finally {
      this.canonInFlight = false;
    }
  }

  // --- epistemic / ledger ------------------------------------------------

  applyEpistemic(signals: ParsedEpistemicSignal[], messageId: number, retireIds: string[] = []) {
    const kept = dropCommonKnowledge(signals, enabledCharacterNames(this.deps.getStory()));
    const applied = applyEpistemicSignals(this.state.epistemic, kept, { boundary: this.boundaryStamp(), messageId }, retireIds);
    this.patch({ epistemic: capEpistemic(applied.entries) });
  }

  applyLedger(signals: ParsedLedgerSignal[], messageId: number) {
    const applied = applyLedgerSignals(this.state.ledger, signals, buildBoundKeySet(this.ledgerBindings()), { boundary: this.boundaryStamp(), messageId });
    this.patch({ ledger: capLedger(applied) });
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

  getLedgerBlock(): string {
    if (!this.deps.getStory() || !this.enabled) return "";
    return renderLedgerBlock(this.getLedger());
  }

  async setEpistemicPinned(id: string, pinned: boolean) {
    this.patch({ epistemic: setEpistemicPinned(this.state.epistemic, id, pinned) }, false);
    this.updateInjection();
    await this.save();
  }

  async removeEpistemicEntry(id: string) {
    this.patch({ epistemic: removeEpistemic(this.state.epistemic, id) }, false);
    this.updateInjection();
    await this.save();
  }

  async setLedgerPinned(id: string, pinned: boolean) {
    this.patch({ ledger: setLedgerPinned(this.state.ledger, id, pinned) }, false);
    this.updateInjection();
    await this.save();
  }

  async removeLedgerEntry(id: string) {
    this.patch({ ledger: removeLedger(this.state.ledger, id) }, false);
    this.updateInjection();
    await this.save();
  }

  // --- injection ---------------------------------------------------------

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
    const rosterNames = this.deps.getStory()?.roster.map(rosterMemberName) ?? [];
    const lowerTurn = turnText.toLowerCase();
    return {
      boundary: this.boundaryStamp(),
      lastMessageId: chat.length - 1,
      turnText,
      turnEntities: rosterNames.filter((name) => lowerTurn.includes(name.trim().toLowerCase())),
      openArcs: this.enabled ? openArcTexts(this.state.arcs, ARC_OPEN_INJECT_LIMIT) : [],
      weights: this.state.settings.scoreWeights,
    };
  }

  private injectionOptions() {
    return { tokenBudgets: this.state.settings.tierTokenBudgets, scoreContext: this.buildScoreContext() };
  }

  updateInjection() {
    const story = this.deps.getStory();
    if (!story || !this.enabled) {
      clearAllMemoryInjection();
      this.stagedPrivate.clear();
      return;
    }
    const options = this.injectionOptions();
    const speaker = activeSpeakerId(story);
    applyMemoryInjection(this.state.entries, speaker, this.state.settings.injectionDepths, options);

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
    this.consolidationInFlight = true;
    try {
      const supersededWinnerIds = new Set<string>();
      const groupOf = () => {
        const active = this.state.entries.filter((entry) => !entry.supersededBy && !entry.foldedInto);
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
        const result = judgedResult ?? consolidateTier(group, matches);
        if (judgedResult?.clearedIds.length) this.patch(clearContradicted(this.state, judgedResult.clearedIds), false);
        summary.uncertain.push(...result.uncertain);
        result.supersededPairs.forEach((pair) => supersededWinnerIds.add(pair.winnerId));
        if (!result.droppedIds.length && !result.supersededPairs.length && !result.confirmedIds.length) continue;
        this.patch(applyConsolidation(this.state, result));
        summary.dropped += result.droppedIds.length;
        summary.superseded += result.supersededPairs.length;
        summary.confirmed += result.confirmedIds.length;
      }
      if (summary.uncertain.length) this.patch(markContradicted(this.state, summary.uncertain), false);
      if (summary.dropped || summary.superseded || summary.confirmed || summary.uncertain.length) {
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
    const settings = this.deps.getExtractionSettings();
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
      client: { ...settings, debugResponse: globalThis.storyOrchestratorDebugSupersessionResponse ?? null },
    });
    if (!result.audit.acceptedDeltas.length) return false;
    this.deps.enqueueExtractorDeltas(result.audit.acceptedDeltas, result.audit.window);
    await this.save();
    return true;
  }

  // --- world info --------------------------------------------------------

  async syncWorldInfo(): Promise<MemoryMirrorSummary> {
    const story = this.deps.getStory();
    if (!story || !this.enabled) return emptyMirrorSummary();
    const host = { getChatId: () => getContext().chatId ?? null, ensureLorebook, loadLorebook, upsertWIEntry, disableWIEntry, bindChatLorebook };
    const result = await syncMemoryMirror({ title: story.title, entries: this.state.entries, writes: this.state.wiWrites, book: this.state.wiBook }, host);
    if (!result) return emptyMirrorSummary();
    if (result.changed) {
      this.patch({ wiWrites: result.writes, wiBook: result.book }, false);
      await this.save();
    }
    return result.summary;
  }
}
