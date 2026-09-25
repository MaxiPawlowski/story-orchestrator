import type { EngineState, NormalizedStoryV2, NormalizedTransition } from "@engine/index";
import {
  callExtractionModel, createTokenMeter, defaultContextLimit, deriveFullScope, deriveScope, getChatWindow, getLastMessageText, isLapse,
  maxTokensFor, maxTokensForInput, planBacklog, preflightNeeded, reconciliationKeySet, reconciliationTargets, retryOnTimeout, runSharedRead, withJudgeCalls,
  sharedReadOverhead, sharedReadWindow, stripChannelNoise, type ExtraGateSource, type ExtractionClientOptions, type ParsedDelta,
  type ParsedFact, type PreflightConfirm, type ReadOwnership, type ReconciliationPlan, type RequestBudget, type RunSharedReadOptions,
  type PassRole, type SchedulerJob, type SharedReadAudit, type SharedReadWindow,
} from "@extraction/index";
import {
  buildEpistemicPassPrompt, buildLedgerPassPrompt, buildShortTermSummaryPrompt, detectSceneBreakHeuristic, fitShortTerm,
  generateMemoryId, parseEpistemicLine, parseEpistemicRetire, parseLedgerLine, provenance, summarizeScene, type ArcEntry,
  type MemoryEntry, type ParsedArcSignal, type ParsedEpistemicSignal, type ParsedLedgerSignal, type ParsedMemoryLine,
} from "@memory/index";
import { anySignal } from "@utils/signals";
import { getActiveGroup, getContext } from "@services/STAPI";
import { SHORT_TERM_COMPACTION_MESSAGES } from "@constants/defaults";
import { enabledCharacterNames } from "../roster";
import type { MemoryCoordinator } from "./memoryCoordinator";
import {
  JUDGED_READ_LIMIT, type ExtractionRuntimeSettings, type ExtractionRuntimeState, type JudgedReadRecord,
  type VerifyDrop,
} from "../types";
import { createTypedJudge } from "../typedRead";
import type { JudgeRuntime } from "../judge";
import { beginRun, type RunGuard, type RunOwnership, type RunToken } from "../runToken";
import {
  buildStallRequest, buildVerifyRequest, readVerify, stallVerdict, STALL_TIMEOUT_MS, verifyVerdict,
  VERIFY_MAX_LINES_PER_CALL, VERIFY_TIMEOUT_MS,
} from "@judge/index";

export const TYPED_READ_WINDOW = 3;
export const BACKLOG_STOPPED_BY_EDIT = "Stopped: the chat changed while memorizing";
export const BACKLOG_STOPPED_BY_UPDATE = "Stopped: the story was updated while memorizing";
export const backlogStoppedByPlayer = (processed: number, windows: number) =>
  `Stopped after ${Math.min(processed, windows)} of ${windows} parts. What was read is kept; the whole-chat pass did not run.`;

// v2.2 plan 06: judged extraction off the LLM lanes. `judged()` answers synchronously whether it took
// the work; the judge call itself is fire-and-forget.
export type JudgedExtractionWork =
  | { kind: "typed"; boundary: number; messageId: number }
  | { kind: "stall"; plan: ReconciliationPlan; reread: () => void };

export interface ExtractionCoordinatorDeps {
  getStory: () => NormalizedStoryV2 | null;
  getState: () => EngineState | null;
  getExtraction: () => ExtractionRuntimeState;
  getSettings: () => ExtractionRuntimeSettings;
  memory: MemoryCoordinator;
  getFiredTransitions: () => NormalizedTransition[];
  getExpansionGateSources: () => ExtraGateSource[];
  enqueueExtractorDeltas: (accepted: ParsedDelta[], window: { from: number; to: number }, origin: string) => void;
  commitBoundary: () => Promise<unknown>;
  fireSceneBreakReplies: (occurrence: number) => Promise<void>;
  emitSceneBreak: (audit: SharedReadAudit, collect?: SchedulerJob[]) => void;
  emitArcsResolved: (arcs: ArcEntry[]) => void;
  setStatus: (status: string) => void;
  judge?: () => JudgeRuntime | null;
  requestBudget?: (role: PassRole) => RequestBudget;
  persist: () => Promise<void>;
  notify: () => void;
  // v2.3 plan 03. Optional so the conversion can land one coordinator at a time: an unwired
  // caller never lapses, and the write-edge census is what tracks real coverage.
  ownership?: RunOwnership;
}

// Owns extras.extraction and every off-path read: the shared-read audit pipeline, the
// scene-break / short-term / epistemic-ledger passes and the memorize backlog. Per-tier writes
// are delegated to the memory coordinator — this class never touches extras.memory directly.
export class ExtractionCoordinator {
  private sceneDetectCursor: { location: string | null; cast: string | null; world: RunToken | null } | null = null;
  private backlogStop: AbortController | null = null;

  constructor(private readonly deps: ExtractionCoordinatorDeps) {}

  private get state(): ExtractionRuntimeState {
    return this.deps.getExtraction();
  }

  private async save() {
    await this.deps.persist();
    this.deps.notify();
  }

  private budget(role: PassRole = "read"): RequestBudget {
    return this.deps.requestBudget?.(role) ?? { contextLimit: defaultContextLimit("no request budget is wired"), meter: createTokenMeter() };
  }

  // v2.3 plan 05: every row this pass writes says where it came from, so a consumer can tell a
  // live claim from one whose source message has since been edited away.
  private provenanceFor(window: { to: number }, pass = "shared-read") {
    return provenance({ source: "extractor", messageId: window.to, boundary: this.deps.getState()?.boundary ?? 0, pass });
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
    this.markReconciliation(reconciliationTargets(audit.reason), audit.acceptedDeltas.map((entry) => `${entry.delta.q}=${String(entry.delta.v)} (${entry.evidence})`), true);
  }

  // v2.3 plan 02 (R6). A read resolves the request it was scheduled for, matched on its targeted
  // keys. Resolving the first *unresolved* event let an ordinary cadence read close a stall it was
  // never about — and left the request that did produce the answer open, which is the stall signal
  // the player sees. No match means no resolution.
  private markReconciliation(targetedKeys: string[], evidence: string[], resolve: boolean) {
    const events = [...this.state.reconciliationEvents];
    const wanted = reconciliationKeySet(targetedKeys);
    const index = events.findIndex((event) => event.resolvedAt === null && reconciliationKeySet(event.targetedKeys) === wanted);
    if (index < 0) return;
    events[index] = { ...events[index], ...(resolve ? { resolvedAt: new Date().toISOString() } : {}), evidence: [...events[index].evidence, ...evidence] };
    this.state.reconciliationEvents = events;
  }

  judged(work: JudgedExtractionWork): boolean {
    const judge = this.deps.judge?.() ?? null;
    if (work.kind === "typed") {
      if (!judge?.active("typedExtraction")) return false;
      void this.runTypedRead(work.boundary, work.messageId).catch((error) => console.warn("[Story Orchestrator] judged typed read failed", error));
      return true;
    }
    if (!judge?.active("stallCheck") || !work.plan.leaves.length) return false;
    void this.runStallPrecheck(work.plan).then((reread) => { if (reread) work.reread(); }).catch(() => work.reread());
    return true;
  }

  private recordJudgedRead(record: JudgedReadRecord) {
    this.state.judgedReads = [...this.state.judgedReads, record].slice(-JUDGED_READ_LIMIT);
  }

  // Every boundary, over the newest messages: only hinted qualities in the current scope, and only
  // while the chat is still where it was when the read began.
  private async runTypedRead(boundary: number, messageId: number) {
    const story = this.deps.getStory();
    const state = this.deps.getState();
    if (!story || !state) return;
    const hinted = deriveScope(story, state.activeCheckpointId, state.blackboard, this.deps.getExpansionGateSources()).filter((entry) => entry.quality.read_as && entry.quality.source === "extractor");
    if (!hinted.length) return;
    const window = getChatWindow(Math.max(0, messageId - TYPED_READ_WINDOW + 1), messageId);
    // C1, the "typed" surface: a judged read whose deltas go into the blackboard apply queue.
    const typedRun = beginRun(this.deps.ownership, { from: window.from, to: window.to });
    const read = await createTypedJudge(() => this.deps.judge?.() ?? null)({ story, state, qualities: hinted.map((entry) => entry.quality), window });
    if (!read || !typedRun.stillOwns() || this.deps.getState()?.lastMessageId !== state.lastMessageId || (getContext().chat?.length ?? 0) - 1 !== messageId) return;
    if (read.deltas.length) this.deps.enqueueExtractorDeltas(read.deltas, { from: window.from, to: window.to }, `judge:typed@${boundary}`);
    this.recordJudgedRead({ at: new Date().toISOString(), boundary, kind: "typed", window: { from: window.from, to: window.to }, answered: read.answered, deltas: read.deltas.map((entry) => ({ q: entry.delta.q, v: entry.delta.v, confidence: entry.judge ?? 0 })), model: read.model, ...(read.fallback ? { fallback: read.fallback } : {}) });
    await this.save();
  }

  // Direct writes only at STALL_DIRECT_P; nothing shown keeps the stall (the event stays open, so the
  // player's stall signal stays); anything else is today's LLM reconcile read. Returns "re-read".
  private async runStallPrecheck(plan: ReconciliationPlan): Promise<boolean> {
    const judge = this.deps.judge?.() ?? null;
    if (!judge) return true;
    // A stall verdict is a claim about the messages the plan was built from, and everything below
    // it — the apply queue, the reconciliation log, the judged-read ring — belongs to that chat.
    const run = beginRun(this.deps.ownership, { from: plan.window.from, to: plan.window.to });
    const window = plan.window.messages.map((message) => ({ id: message.index, speaker: message.speaker, text: message.text }));
    const result = await judge.ask("stall", buildStallRequest(plan.leaves, window), { timeoutMs: STALL_TIMEOUT_MS, summarize: (answers) => Object.fromEntries(plan.leaves.map((leaf, index) => [`${leaf.q}${leaf.op}${JSON.stringify(leaf.v)}`, (answers?.[`leaf:${index}`] as { noul?: number } | undefined)?.noul ?? "none"])) });
    if (!run.stillOwns()) return false;
    const verdict = stallVerdict(result.answers, plan.leaves);
    const record = { at: new Date().toISOString(), boundary: plan.descriptor.boundary, kind: "stall" as const, window: { from: plan.window.from, to: plan.window.to }, answered: result.answers ? plan.leaves.map((leaf) => leaf.q) : [], model: result.model, ...(result.fallback ? { fallback: result.fallback } : {}) };
    if (verdict.kind === "direct") {
      const deltas: ParsedDelta[] = verdict.deltas.map((entry) => ({ delta: { q: entry.q, v: entry.v, source: "extractor" }, evidence: `judge:reconcile p=${entry.p}`, judge: entry.p }));
      this.deps.enqueueExtractorDeltas(deltas, { from: plan.window.from, to: plan.window.to }, `judge:stall@${plan.descriptor.boundary}`);
      this.markReconciliation(plan.descriptor.targetedKeys, verdict.deltas.map((entry) => `${entry.q}=${String(entry.v)} (judge:reconcile p=${entry.p})`), true);
      this.recordJudgedRead({ ...record, deltas: verdict.deltas.map((entry) => ({ q: entry.q, v: entry.v, confidence: entry.p })), note: "direct" });
    } else {
      this.recordJudgedRead({ ...record, deltas: [], note: verdict.kind === "genuine" ? `nothing shown (max p ${verdict.maxP})` : `re-read (max p ${verdict.maxP})` });
      if (verdict.kind === "genuine") this.markReconciliation(plan.descriptor.targetedKeys, [`judge: nothing shown (max p ${verdict.maxP})`], false);
    }
    await this.save();
    return verdict.kind === "reread";
  }

  setSchedulerSnapshot(snapshot: ExtractionRuntimeState["scheduler"]) {
    this.state.scheduler = snapshot;
  }

  async applyAudit(audit: SharedReadAudit, facts: ParsedFact[], memoryLines: ParsedMemoryLine[] = [], arcSignals: ParsedArcSignal[] = [], epistemicSignals: ParsedEpistemicSignal[] = [], ledgerSignals: ParsedLedgerSignal[] = [], read: ReadOwnership | null = null, sceneWork?: SchedulerJob[]) {
    if (!this.deps.getStory()) return;
    if (read && !read.stillOwns()) return;
    const boundary = this.deps.getState()?.boundary ?? 0;
    this.deps.enqueueExtractorDeltas(audit.acceptedDeltas, audit.window, audit.id);
    const memory = this.deps.memory;
    const newMemoryEntries: MemoryEntry[] = [
      ...facts.map((fact) => this.newEntry({ provenance: this.provenanceFor(audit.window), tier: "facts", text: fact.text, type: "fact", importance: fact.importance, expiration: "permanent", entities: [], evidence: fact.evidence, messageId: audit.window.to })),
      ...memoryLines.map((line) => this.newEntry({ provenance: this.provenanceFor(audit.window), tier: line.tier, text: line.text, type: line.type, importance: line.importance, expiration: line.expiration, entities: line.entities, evidence: line.evidence, characterId: line.characterId, messageId: audit.window.to })),
    ];
    const memoryEnabled = memory.enabled;
    // The main extraction write path. `verifyEntries` is a judge pass, so it can be slow, and
    // everything after it writes the read's conclusions into the memory tiers, the epistemic and
    // ledger stores and the audit ring. A read of one chat's window landing in another chat would
    // deposit the whole result there.
    //
    // The window matters as much as the chat: these entries are claims ABOUT the messages that
    // were read, so an edit inside that span invalidates them, while a reply merely appended after
    // it does not.
    const run = beginRun(this.deps.ownership, { from: audit.window.from, to: audit.window.to });
    const verified = await this.verifyEntries(newMemoryEntries, audit.window);
    if (!run.stillOwns()) return;
    await memory.applyEntries(verified.kept, audit.window);
    if (!run.stillOwns()) return;
    memory.recordVerifyDrops(verified.dropped);
    const resolvedArcs = memoryEnabled && arcSignals.length ? memory.applyArcSignals(arcSignals, audit.window.to) : [];
    if (memory.capable && epistemicSignals.length) memory.applyEpistemic(epistemicSignals, audit.window.to);
    if (memory.capable && ledgerSignals.length) memory.applyLedger(ledgerSignals, audit.window.to);
    this.state.audits = [...this.state.audits, audit].slice(-20);
    if (audit.reason.startsWith("reconcile:")) this.resolveReconciliation(audit);
    this.state.lastReadBoundary = boundary;
    if (memoryEnabled && (newMemoryEntries.length || arcSignals.length || epistemicSignals.length || ledgerSignals.length)) memory.updateInjection();
    if (resolvedArcs.length) this.deps.emitArcsResolved(resolvedArcs);
    await this.save();
    if (memoryEnabled && audit.sceneBreak) this.deps.emitSceneBreak(audit, sceneWork);
  }

  // v2.2 plan 02: check each new FACT/MEMORY line against the read's own window before it is stored.
  // Deltas and arc/epistemic/ledger signals never wait on this; a judge failure stores every line.
  private async verifyEntries(entries: MemoryEntry[], window: { from: number; to: number }): Promise<{ kept: MemoryEntry[]; dropped: VerifyDrop[] }> {
    const judge = this.deps.judge?.() ?? null;
    const story = this.deps.getStory();
    if (!entries.length || !story || !judge?.active("memoryVerify")) return { kept: entries, dropped: [] };
    const transcript = getChatWindow(window.from, window.to).messages.map((message) => ({ id: `msg_${message.index}`, speaker: message.speaker, text: message.text }));
    const cast = story.roster.map((member) => member.name ?? member.id);
    const kept: MemoryEntry[] = [];
    const dropped: VerifyDrop[] = [];
    for (let start = 0; start < entries.length; start += VERIFY_MAX_LINES_PER_CALL) {
      const chunk = entries.slice(start, start + VERIFY_MAX_LINES_PER_CALL);
      const result = await judge.ask("memoryVerify", buildVerifyRequest({ storyTitle: story.title, cast, transcript, lines: chunk.map((entry) => entry.text) }), {
        timeoutMs: VERIFY_TIMEOUT_MS,
        summarize: (answers) => Object.fromEntries(readVerify(answers ?? {}, chunk.length).map((p, index) => [`line:${index}`, p ?? "none"])),
      });
      const scores = result.answers ? readVerify(result.answers, chunk.length) : chunk.map(() => null);
      chunk.forEach((entry, index) => {
        const verdict = verifyVerdict(scores[index]);
        if (verdict.action === "drop") dropped.push({ entry, p: scores[index] ?? 0, at: new Date().toISOString(), model: result.model });
        else kept.push(verdict.action === "downweight" ? { ...entry, confidence: verdict.confidence } : entry);
      });
    }
    return { kept, dropped };
  }

  // `window` names a span the caller has a REASON to read again — the messages two conflicting claims
  // came from. Without one a manual read means "read the transcript as it is now": the engine's state
  // lags the chat by design (the boundary for a just-posted message lands on the next flush), and a
  // read taken from that state had an EMPTY window, so the evidence rule rejected every delta it
  // produced (found live 2026-09-21: three corpus scenarios read nothing and failed five steps later).
  async runNow(debugResponse?: string, reason = "manual", window?: { from: number; to: number }) {
    const story = this.deps.getStory();
    const state = this.deps.getState();
    if (!story || !state) return false;
    const memory = this.deps.memory;
    const chatLength = Array.isArray(getContext().chat) ? getContext().chat.length : 0;
    const readState = chatLength - 1 > state.lastMessageId ? { ...state, lastMessageId: chatLength - 1, chatLength } : state;
    const readWindow = sharedReadWindow({ state: readState, priority: 0, ...(window && window.from >= 0 ? { window: getChatWindow(window.from, window.to) } : {}) });
    const read = beginRun(this.deps.ownership, { from: readWindow.from, to: readWindow.to });
    const result = await runSharedRead({
      story,
      state: readState,
      priority: 0,
      reason,
      window: readWindow,
      facts: memory.getFacts(),
      firedTransitions: this.deps.getFiredTransitions(),
      extraGateSources: this.deps.getExpansionGateSources(),
      openArcs: memory.getOpenArcs(),
      epistemicLedgerCapable: memory.capable,
      entities: memory.getEntities(),
      client: { ...this.deps.getSettings(), role: "read", budget: this.budget(), signal: read.signal, debugResponse: debugResponse ?? globalThis.storyOrchestratorDebugExtractionResponse ?? null },
    }).catch((error: unknown) => { if (isLapse(error)) return null; throw error; }).finally(() => read.release());
    if (!result) return false;
    await this.applyAudit(result.audit, result.facts, result.memory, result.arcs, result.epistemic, result.ledger, read);
    if (!read.stillOwns()) return false;
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

    const ownership = this.deps.ownership;
    const recorded = this.sceneDetectCursor;
    const cursor = recorded && (!recorded.world || !ownership || ownership.check(recorded.world).ok) ? recorded : null;
    const locationChanged = Boolean(cursor && cursor.location !== null && locationValue !== null && cursor.location !== locationValue);
    const castChanged = Boolean(cursor && cursor.cast !== null && cast !== null && cursor.cast !== cast);
    this.sceneDetectCursor = { location: locationValue, cast, world: ownership?.mint() ?? null };

    return detectSceneBreakHeuristic(text, locationChanged, castChanged);
  }

  async runSceneBreakPass(audit: SharedReadAudit) {
    const memory = this.deps.memory;
    if (!this.deps.getStory() || !audit.sceneBreak || !memory.enabled) return;
    // v2.4 plan 03 D5: the whole scene since the previous summary, not only the read that detected the
    // break. The summary describes exactly that span, so an edit inside it makes the summary a
    // description of messages that no longer exist. A reply appended after it is fine.
    const range = { from: memory.sceneStart(audit.window.to), to: audit.window.to };
    const run = beginRun(this.deps.ownership, range);
    const scene = getChatWindow(range.from, range.to);
    const outcome = await summarizeScene({
      messages: scene.messages, budget: this.budget("synthesis"), stillOwns: () => run.stillOwns(),
      summarize: async (prompt, maxTokens) => stripChannelNoise(await callExtractionModel(prompt, {
        profileId: this.deps.getSettings().profileId, role: "synthesis", maxTokens, signal: run.signal, refuseIncomplete: true,
        debugResponse: globalThis.storyOrchestratorDebugSceneSummaryResponse ?? null,
      })),
    });
    if (!outcome || !run.stillOwns()) return;
    const evidence = scene.messages.filter((message) => message.messageId >= audit.window.from).map((message) => `${message.speaker}: ${message.text}`).join("\n") || "(empty)";
    const entry = this.newEntry({ provenance: this.provenanceFor(range, "scene-summary"), tier: "scene_history", text: outcome.summary, type: "scene", importance: 2, expiration: "permanent", entities: [], evidence, messageId: range.to });
    const sceneOccurrence = await memory.addSceneSummary(entry, range);
    if (sceneOccurrence === null) return;
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
    if (!window.messages.length) return;
    const previous = memory.shortTermEntry();
    if (previous?.pinned) return;
    // This one REPLACES the rolling short-term entry, so a stale result does not merely add noise
    // — it overwrites the live summary with one describing another chat or an edited window.
    const run = beginRun(this.deps.ownership, { from: window.from, to: window.to });
    const fit = await fitShortTerm(window.messages, previous?.text ?? null, this.budget("synthesis"));
    const summary = stripChannelNoise(await callExtractionModel(buildShortTermSummaryPrompt(previous?.text ?? null, fit.text), {
      profileId: this.deps.getSettings().profileId, role: "synthesis",
      maxTokens: maxTokensFor("shortTerm", fit.tokens), signal: run.signal, refuseIncomplete: true,
      debugResponse: globalThis.storyOrchestratorDebugShortTermResponse ?? null,
    }));
    if (!summary || !run.stillOwns()) return;
    const span = { from: fit.from, to: window.to };
    const entry = this.newEntry({ provenance: this.provenanceFor(span, "short-term-compaction"), tier: "short_term", text: summary, type: "scene", importance: 2, expiration: "session", entities: [], evidence: fit.text, messageId: span.to });
    await memory.replaceShortTerm(entry, span);
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

    // Two model calls and two stores, with a write in between: the epistemic signals are applied
    // before the ledger prompt is even sent, so one check at the end would leave the first store
    // written in a chat that had already been replaced.
    const run = beginRun(this.deps.ownership, { from: audit.window.from, to: audit.window.to });
    const existing = memory.activeEpistemic();
    const epistemicResponse = await callExtractionModel(buildEpistemicPassPrompt(sceneText, enabledCharacterNames(story), existing.map((entry) => ({ tag: entry.tag, subject: entry.subject, content: entry.content, hiddenFrom: entry.hiddenFrom }))), {
      profileId: settings.profileId, role: "read",
      maxTokens: maxTokensForInput("epistemic", sceneText), signal: run.signal,
      debugResponse: globalThis.storyOrchestratorDebugEpistemicResponse ?? null,
    });
    if (!run.stillOwns()) return false;
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
      profileId: settings.profileId, role: "read",
      maxTokens: maxTokensForInput("ledger", sceneText), signal: run.signal,
      debugResponse: globalThis.storyOrchestratorDebugLedgerResponse ?? null,
    });
    if (!run.stillOwns()) return false;
    const ledgerSignals: ParsedLedgerSignal[] = [];
    for (const line of stripChannelNoise(ledgerResponse).split(/\r?\n/)) ledgerSignals.push(...parseLedgerLine(line.trim()));
    memory.applyLedger(ledgerSignals, audit.window.to);
    memory.updateInjection();
    await this.save();
    return epistemicSignals.length > 0 || ledgerSignals.length > 0 || retireIds.length > 0;
  }

  // Full-scope re-read of an existing chat, window by window, then one whole-chat pass that is
  // allowed to move the blackboard. Progress is surfaced through the memory backfill state.
  // v2.4 plan 03 D5: the windows are packed to the request budget (`windowSize` only caps their
  // message count), the whole-chat pass is tail-fit, and a caller that passes `confirm` is asked
  // before anything is sent when the run is large. Automatic and debug callers pass none.
  async runMemorizeBacklog(windowSize?: number, confirm?: PreflightConfirm): Promise<boolean> {
    const story = this.deps.getStory();
    const memory = this.deps.memory;
    if (!story || !memory.enabled || memory.backfill?.running || this.backlogStop) return false;
    const length = Array.isArray(getContext().chat) ? getContext().chat.length : 0;
    // V3: the backlog reads the whole chat window by window for minutes; a chat switch in between
    // used to read the NEXT chat's windows into memory this pass still believed was its own.
    const read = beginRun(this.deps.ownership, { from: 0, to: Math.max(0, length - 1) });
    const stop = new AbortController();
    this.backlogStop = stop;
    const owned: ReadOwnership = {
      stillOwns: () => !stop.signal.aborted && read.stillOwns(),
      lapsedDetail: () => (stop.signal.aborted ? "stopped" : read.lapsedDetail()),
      signal: anySignal([stop.signal, read.signal]),
    };
    const budget = this.budget();
    let windows: SharedReadWindow[] | null = null;
    let completed = false;
    let failure: string | null = null;
    try {
      const messages = getChatWindow(0, length - 1).messages;
      const overhead = sharedReadOverhead(this.backlogRead(story, "memorize:window", { from: 0, to: -1, messages: [] }, { profileId: null, role: "read" }));
      const estimate = confirm ? await planBacklog(messages, overhead, { contextLimit: budget.contextLimit, meter: createTokenMeter() }, windowSize) : null;
      const preflight = estimate ? withJudgeCalls(estimate.preflight, this.deps.judge?.()?.active("memoryVerify") === true) : null;
      if (!read.stillOwns() || (confirm && preflight && preflightNeeded(preflight, budget.contextLimit) && !(await confirm(preflight)))) return false;
      windows = [];
      memory.setBackfill({ running: true, processed: 0, total: (estimate?.windows.length ?? 0) + 1, lastError: null, preparing: true });
      await this.save();
      const plan = await planBacklog(messages, overhead, budget, windowSize);
      windows = plan.windows;
      if (owned.stillOwns()) {
        memory.setBackfill({ running: true, processed: 0, total: windows.length + 1, lastError: null });
        await this.save();
      }
      completed = await this.memorizeWindows(story, windows, length, owned, budget);
    } catch (error) {
      failure = error instanceof Error ? error.message : "Memorize backlog failed";
    } finally {
      if (this.backlogStop === stop) this.backlogStop = null;
      read.release();
    }
    return windows || failure ? this.endBacklog(read, stop.signal, { completed, failure, windows: windows?.length ?? 0 }) : false;
  }

  cancelMemorizeBacklog(): boolean {
    if (!this.backlogStop || this.backlogStop.signal.aborted) return false;
    this.backlogStop.abort();
    return true;
  }

  private backlogRead(story: NormalizedStoryV2, reason: "memorize:window" | "memorize:full", window: SharedReadWindow, client: ExtractionClientOptions): RunSharedReadOptions {
    const memory = this.deps.memory;
    const state = this.deps.getState()!;
    const windowed = reason === "memorize:window" ? { openArcs: memory.getOpenArcs(), epistemicLedgerCapable: memory.capable, entities: memory.getEntities() } : {};
    return { story, state, priority: 0, reason, window, scope: deriveFullScope(story, state.blackboard), firedTransitions: this.deps.getFiredTransitions(), facts: memory.getFacts(), ...windowed, client };
  }

  private async memorizeWindows(story: NormalizedStoryV2, windows: SharedReadWindow[], length: number, read: ReadOwnership, budget: RequestBudget): Promise<boolean> {
    const memory = this.deps.memory;
    const client = { ...this.deps.getSettings(), role: "read" as const, budget, signal: read.signal, debugResponse: globalThis.storyOrchestratorDebugExtractionResponse ?? null };
    const sceneWork: SchedulerJob[] = [];
    for (const window of windows) {
      if (!read.stillOwns()) return false;
      const result = await retryOnTimeout((timeoutScale) => runSharedRead(this.backlogRead(story, "memorize:window", window, { ...client, timeoutScale })));
      await this.applyAudit({ ...result.audit, acceptedDeltas: [] }, result.facts, result.memory, result.arcs, result.epistemic, result.ledger, read, sceneWork);
      await this.runSceneWork(sceneWork, read);
      if (!read.stillOwns()) return false;
      const progress = memory.backfill!;
      memory.setBackfill({ ...progress, processed: progress.processed + 1 });
      await this.save();
    }

    if (!read.stillOwns()) return false;
    const fullResult = await retryOnTimeout((timeoutScale) => runSharedRead(this.backlogRead(story, "memorize:full", getChatWindow(0, Math.max(0, length - 1)), { ...client, timeoutScale })));
    await this.applyAudit(fullResult.audit, [], [], [], [], [], read, sceneWork);
    await this.runSceneWork(sceneWork, read);
    if (!read.stillOwns()) return false;
    await this.deps.commitBoundary();
    return true;
  }

  private async runSceneWork(jobs: SchedulerJob[], read: ReadOwnership) {
    for (const job of jobs.splice(0)) {
      if (!read.stillOwns()) return;
      await job.run?.().catch((error: unknown) => { if (!isLapse(error)) console.warn(`[Story Orchestrator] ${job.reason} during the memorize backlog failed`, error); });
    }
  }

  // A player's own Stop is not a failure, so it is a note, never `lastError`.
  private async endBacklog(read: RunGuard, stop: AbortSignal, run: { completed: boolean; failure: string | null; windows: number }): Promise<boolean> {
    const lapse = read.lapsed();
    if (lapse && lapse !== "window" && lapse !== "version") return false;
    const memory = this.deps.memory;
    const total = run.windows + 1;
    const processed = run.completed ? total : memory.backfill?.processed ?? 0;
    const stopped = !run.completed && !lapse && stop.aborted;
    const lastError = run.completed || stopped ? null
      : lapse === "window" ? BACKLOG_STOPPED_BY_EDIT
        : lapse === "version" ? BACKLOG_STOPPED_BY_UPDATE
          : run.failure ?? "Memorize backlog failed";
    memory.setBackfill({ running: false, processed, total, lastError, ...(stopped ? { stoppedNote: backlogStoppedByPlayer(processed, run.windows) } : {}) });
    this.deps.setStatus(run.completed ? "Memorize backlog complete" : stopped ? "Memorize backlog stopped" : "Memorize backlog failed");
    await this.save();
    return run.completed;
  }
}
