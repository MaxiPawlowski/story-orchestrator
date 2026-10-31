import { type Story } from "@engine/index";
import type { CopilotMessage, CopilotStage, DriverContext, ProposalResult, Suggestion } from "@copilot/index";
import type { ProvisioningEnvironment, ProvisioningOp, ProvisioningResult, WizardSessionState, WizardSessionUpdate } from "@wizard/index";
import { type ExtraGateSource, type ParsedFact, type ReadOwnership, type SharedReadAudit } from "@extraction/index";
import {
  type ArcEntry, type EpistemicEntry, type LedgerView, type MemoryEntry, type MemoryTier, type ParsedArcSignal,
  type ParsedEpistemicSignal, type ParsedLedgerSignal, type ParsedMemoryLine, type UncertainPair,
} from "@memory/index";
import type { CuratorOp, CuratorPassOutcome } from "@stagecraft/index";
import type { LoreCreateOutcome } from "./loreCreator";
import { listGroupMemberNames, type WIEntrySnapshot } from "@services/STAPI";
import type { LivingStartInput } from "@generation/living/start";
import type { JudgedExtractionWork } from "./coordinators/extractionCoordinator";
import type { wireCoordinators } from "./managerWiring";
import type { MemoryMirrorSummary } from "./memoryMirror";
import type { CardReadBackRecord } from "@utils/cardReadBack";
import { clearWizardSession, loadWizardSession, saveWizardSession } from "./wizardSessions";
import { confirmPreflight } from "./requestBudget";
import type { StagecraftRuntimeState } from "./types";
import type { AgendaProposalsState } from "./agendaProposals";
import type { JournalRecordKind } from "./journal";
import { withDismissal } from "./checks";
import { getGlobalSettings, setGlobalSettings } from "./settingsStore";
import type { ChanceDraw } from "./chance";
import { createChance, recordChanceDraw } from "./rolls";
import { cueForSwipe, recordCuedLine, type CuedLine } from "./npcReplyRewind";
import { recordChainEnd, type ChainEnd } from "./chainEnds";

type WiredCoordinators = ReturnType<typeof wireCoordinators>;

export abstract class CoordinatorDelegates {
  protected abstract readonly co: WiredCoordinators;

  get chapters() { return this.co.memory.chapters; }
  postNotes(type: unknown, dryRun: unknown) { return this.co.effects().postPendingNotes(type, dryRun, this.co.rollbackDeps.extras()); }
  get game() { return this.co.game; }
  get recap() { return this.co.recap; }
  get patterns() { return this.co.patterns; }
  get meanwhile() { return this.co.meanwhile; }
  get living() { return this.co.living; }
  get promises() { return this.co.promises; }
  get witness() { return this.co.witness; }
  get rumors() { return this.co.rumors; }
  get cues() { return this.co.cues; }
  get echoes() { return this.co.echoes; }
  skipAhead() { return this.co.skip.run(); }
  get carry() { return this.co.carry; }
  protected noticeHolds = 0;
  async holdingRollbackNotice<T>(work: () => Promise<T>): Promise<T> {
    this.noticeHolds += 1;
    try { return await work(); } finally { this.noticeHolds -= 1; }
  }
  protected generationOpen = false;
  setGenerationOpen(open: boolean) {
    if (open) this.co.narrator.requested();
    if (this.generationOpen === open) return;
    this.generationOpen = open;
    this.notify();
  }
  async livingStory(input: Omit<LivingStartInput, "members">): Promise<Story> {
    const { buildLivingStory } = await import("@generation/living/start");
    return buildLivingStory({ ...input, members: listGroupMemberNames() });
  }
  decideMeanwhile(id: string, status: "accepted" | "rejected", reason?: string) { return this.co.meanwhile.decide(id, status, reason); }
  refreshMemoryInjection() { this.co.memory.updateInjection(); }

  async runCopilotStage(
    input: { draft: Story; stage: CopilotStage; message: string; history: CopilotMessage[]; environment?: ProvisioningEnvironment },
    debugResponse?: string,
  ): Promise<ProposalResult> { return this.co.copilot.runStage(input, debugResponse); }
  getProvisioningEnvironment(draft?: Story): ProvisioningEnvironment { return this.co.copilot.getProvisioningEnvironment(draft); }
  async applyProvisioning(op: ProvisioningOp, draft?: Story): Promise<ProvisioningResult> { return this.co.copilot.applyProvisioning(op, draft); }
  async recheckCreatedCard(op: Extract<ProvisioningOp, { kind: "createCharacterCard" }>, avatar: string, draft?: Story): Promise<CardReadBackRecord> {
    return this.co.copilot.recheckCreatedCard(op, avatar, draft);
  }
  async readProvisioningEntry(lorebook: string, comment: string): Promise<WIEntrySnapshot | null> { return this.co.copilot.readProvisioningEntry(lorebook, comment); }
  getWizardSession(key: string): WizardSessionState | null { return loadWizardSession(key); }
  saveWizardSession(session: WizardSessionUpdate) { saveWizardSession(session); }
  clearWizardSession(key: string) { clearWizardSession(key); }
  getDriverContext(): DriverContext | null { return this.co.copilot.getDriverContext(); }
  async runCopilotSuggest(debugResponse?: string): Promise<Suggestion[]> { return this.co.copilot.runSuggest(debugResponse); }
  async runCopilotReport(debugResponse?: string): Promise<string> {
    const report = await this.co.copilot.runReport(debugResponse);
    if (report) this.noteAuthorMove("Author report", report.slice(0, 600));
    return report;
  }
  setCopilotNudge(text: string, depth = 1) {
    this.co.copilot.setNudge(text, depth);
    if (text.trim() && this.co.copilot.getActiveNudge() === text.trim()) this.noteAuthorMove("Author nudge", text.trim());
  }
  private noteAuthorMove(move: string, note: string) {
    this.noteRecap(`${move} at ${this.co.copilot.getDriverContext()?.activeCheckpointName ?? "no checkpoint"}`, note, "author");
    this.notify();
  }
  abstract noteRecap(summary: string, detail: string, kind?: JournalRecordKind): void;
  abstract notify(): void;
  setCheckDismissed(check: string, dismissed: boolean) {
    setGlobalSettings({ help: { dismissedChecks: withDismissal(getGlobalSettings().help.dismissedChecks, check, dismissed) } });
    this.notify();
  }
  abstract getLoadedChatId(): string | null;
  recordChanceDraw(draw: ChanceDraw, messageId: number) {
    if (draw.chatId !== this.getLoadedChatId()) return;
    const extras = this.co.rollbackDeps.extras();
    extras.chance = recordChanceDraw(extras.chance ?? createChance(), draw, messageId);
    this.notify();
  }
  agendaProposalSlice() {
    const deps = this.co.rollbackDeps;
    return {
      get: () => deps.extras().agendaProposals, set: (next: AgendaProposalsState) => { deps.extras().agendaProposals = next; },
      ownership: deps.ownership, persist: deps.persist, notify: deps.notify,
    };
  }
  clearCopilotNudge() { this.co.copilot.clearNudge(); }
  reapplyCopilotNudge() { this.co.copilot.reapplyNudge(); }
  getActiveNudge(): string | null { return this.co.copilot.getActiveNudge(); }
  getExtractionFacts(): ParsedFact[] { return this.co.memory.getFacts(); }
  getExpansionGateSources(): ExtraGateSource[] { return this.co.expansion.getGateSources(); }
  recordReconciliation(descriptor: { checkpointId: string; boundary: number; targetedKeys: string[] }) { this.co.extraction.recordReconciliation(descriptor); }
  judgedExtraction(work: JudgedExtractionWork): boolean { return this.co.extraction.judged(work); }
  async applyExtractionAudit(
    audit: SharedReadAudit,
    facts: ParsedFact[],
    memoryLines: ParsedMemoryLine[] = [],
    arcSignals: ParsedArcSignal[] = [],
    epistemicSignals: ParsedEpistemicSignal[] = [],
    ledgerSignals: ParsedLedgerSignal[] = [],
    read: ReadOwnership | null = null,
  ) { await this.co.extraction.applyAudit(audit, facts, memoryLines, arcSignals, epistemicSignals, ledgerSignals, read); }
  async runArcSummaryPass(arcIds: string[]): Promise<boolean> { return this.co.memory.runArcSummaryPass(arcIds); }
  detectSceneBreak() { return this.co.extraction.detectSceneBreak(); }
  async runSceneBreakPass(audit: SharedReadAudit) { await this.co.extraction.runSceneBreakPass(audit); }
  shouldCompactShortTerm(messageId: number): boolean { return this.co.extraction.shouldCompactShortTerm(messageId); }
  async runShortTermCompaction() { await this.co.extraction.runShortTermCompaction(); }
  async runEpistemicLedgerPass(audit: SharedReadAudit): Promise<boolean> { return this.co.extraction.runEpistemicLedgerPass(audit); }
  async runExtractionNow(debugResponse?: string, reason = "manual", window?: { from: number; to: number }) { return this.co.extraction.runNow(debugResponse, reason, window); }
  runMemorizeBacklog(windowSize?: number) { return this.co.extraction.backlog.runMemorizeBacklog(windowSize); }
  memorizeChat() { return this.co.extraction.backlog.runMemorizeBacklog(undefined, confirmPreflight); }
  cancelMemorizeBacklog(): boolean { return this.co.extraction.backlog.cancelMemorizeBacklog(); }
  async setMemoryPinned(id: string, pinned: boolean) { await this.co.memory.setMemoryPinned(id, pinned); }
  async excludeMemoryEntry(id: string): Promise<boolean> { return this.co.memory.queue.excludeMemoryEntry(id); }
  async restoreMemoryEntry(entry: MemoryEntry) { await this.co.memory.restoreMemoryEntry(entry); }
  async editMemoryEntry(id: string, text: string) { await this.co.memory.editMemoryEntry(id, text); }
  async storeDroppedMemory(id: string) { return this.co.memory.queue.storeDroppedEntry(id); }
  getArcs(): ArcEntry[] { return this.co.memory.getArcs(); }
  getOpenArcs(): string[] { return this.co.memory.getOpenArcs(); }
  getEpistemicLedgerCapable(): boolean { return this.co.memory.capable; }
  getEntities(): string[] { return this.co.memory.getEntities(); }
  async setArcPinned(id: string, pinned: boolean) { await this.co.memory.setArcPinned(id, pinned); }
  async removeArc(id: string) { await this.co.memory.removeArc(id); }
  getCanon(): string { return this.co.memory.canon.getCanon(); }
  async regenerateCanon(force = false): Promise<boolean> { return this.co.memory.canon.regenerateCanon(force); }
  async draftCanon(): Promise<boolean> { return this.co.memory.canon.regenerateCanon(true, true); }
  async decideCanonDraft(accept: boolean): Promise<boolean> { return this.co.memory.canon.decideDraft(accept); }
  scheduleExpansionForActive(schedule: (reason: string, run: () => Promise<void>) => void) { return this.co.expansion.scheduleForActive(schedule); }
  async runExpansionNow(debugResponse?: string, confirm = false) { return this.co.expansion.runNow(debugResponse, confirm ? (preflight) => confirmPreflight(preflight, "authoring") : undefined); }
  onMemberDrafted(chId: number | [number]) {
    const id = this.co.memory.draftedRosterId(chId);
    this.co.cues.draft(id);
    this.co.memory.onMemberDrafted(chId);
    this.co.cues.staged();
    this.co.pacing.draftGuidance(id);
  }
  get speech() { return this.co.speech.speech; }
  talkPolicy() { return this.co.speech.policy(); }
  directDraft(member: string, text: string) { return this.co.pacing.armDirection(member, text, "draft"); }
  takeAskingPlayer(speaker: string): boolean { return this.co.pacing.takeAskingPlayer(speaker); }
  recordCue(line: CuedLine) {
    const extras = this.co.rollbackDeps.extras();
    extras.cuedLines = recordCuedLine(extras.cuedLines, line);
  }
  recordChainEnd(end: ChainEnd) {
    const extras = this.co.rollbackDeps.extras();
    extras.chainEnds = recordChainEnd(extras.chainEnds, end);
    void this.co.rollbackDeps.persist();
  }
  cueSwipe(type: string, messageId: number) {
    const line = type === "swipe" ? cueForSwipe(this.co.rollbackDeps.extras().cuedLines, messageId) : null;
    if (line) this.co.pacing.armDirection(line.member, line.text, "draft");
  }
  async prepareDraftedBeat(chId: number | [number]) { const id = this.co.memory.draftedRosterId(chId); return id ? this.co.inner.prepare(id) : false; }
  innerBeatDue(): boolean { return this.co.inner.due(); }
  runInnerBeat(): Promise<number> { return this.co.inner.run(); }
  innerBeatPending(): Promise<unknown> | null { return this.co.inner.pending(); }
  commitContinuityNote(rendered: boolean, messageId?: number) {
    this.co.stagecraft.commitNote(rendered);
    this.co.memory.chapters.commitBridge(rendered);
    this.co.cues.settle(rendered, messageId);
  }
  runWardenPass(replyMessageId: number) { return this.co.stagecraft.runWardenPass(replyMessageId); }
  withholdTurnBlocks() { this.co.memory.withholdPrivateKnowledge(); this.co.pacing.withholdGuidance(); }
  restoreTurnNotes() { this.co.stagecraft.restoreNote(); this.co.memory.chapters.restoreBridge(); }
  turnBlocksHeld(): boolean { return this.co.pacing.holding; }
  getEpistemic(): EpistemicEntry[] { return this.co.memory.getEpistemic(); }
  getLedger(): LedgerView[] { return this.co.memory.getLedger(); }
  getEpistemicBlock(): string { return this.co.memory.getEpistemicBlock(); }
  getAppliedEpistemicBlock(): string { return this.co.memory.getAppliedEpistemicBlock(); }
  getLedgerBlock(): string { return this.co.memory.getLedgerBlock(); }
  async setEpistemicPinned(id: string, pinned: boolean) { await this.co.memory.setEpistemicPinned(id, pinned); }
  async removeEpistemicEntry(id: string) { await this.co.memory.removeEpistemicEntry(id); }
  async setLedgerPinned(id: string, pinned: boolean) { await this.co.memory.setLedgerPinned(id, pinned); }
  async removeLedgerEntry(id: string) { await this.co.memory.removeLedgerEntry(id); }
  getMemoryInjectionBlocks(): Record<MemoryTier, string> { return this.co.memory.getInjectionBlocks(); }
  async runConsolidation(): Promise<{ dropped: number; superseded: number; confirmed: number; uncertain: UncertainPair[] }> { return this.co.memory.runConsolidation(); }
  async runSupersessionBridge(supersedingEntries: MemoryEntry[]): Promise<boolean> { return this.co.memory.runSupersessionBridge(supersedingEntries); }
  async syncWorldInfo(): Promise<MemoryMirrorSummary> { return this.co.memory.syncWorldInfo(); }
  getStagecraftState(): StagecraftRuntimeState { return this.co.stagecraft.getState(); }
  curatorDueForRun(): boolean { return this.co.stagecraft.dueForRun(); }
  async runWiCuratorPass(reason?: string, debugResponse?: string): Promise<CuratorPassOutcome> { return this.co.stagecraft.runCuratorPass(reason, debugResponse); }
  async runLoreCreatePass(reason?: string, debugResponse?: string): Promise<LoreCreateOutcome> { return this.co.stagecraft.runCreatePass(reason, debugResponse); }
  async setCuratorOpDecision(id: string, index: number, status: "accepted" | "rejected", op?: CuratorOp) { await this.co.stagecraft.setOpDecision(id, index, status, op); }
  async decideCuratorProposal(id: string, status: "accepted" | "rejected") { await this.co.stagecraft.decideProposal(id, status); }
  async applyCuratorProposals(): Promise<number> { return this.co.stagecraft.applyAccepted(); }
}
