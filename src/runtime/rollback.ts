import { chapterKit, loadChapterKit } from "./chapterPort";
import { beginRun, type RunGuard, type RunOwnership } from "./runToken";
import { rollbackModelCalls } from "./modelCallLog";
import type { RollbackOutcome, StoryEngine } from "@engine/index";
import type { SharedReadWindow } from "@extraction/index";
import { getChatWindow } from "@extraction/index";
import type { RollbackKind, RollbackNotice, RollbackUnavailable } from "./narrative";
import type { JournalContext, SessionJournal } from "./journal";
import type { DecodeJournal } from "./messageIdentity";

export type { DecodeJournal };
import { dropJudgeCallsAfter } from "@judge/settings";
import { rewindCuedLines, rewindNpcReplies, rewindOnEnterPosts } from "./npcReplyRewind";
import { rewindSpeech } from "./speechLedger";
import { rewindChainEnds } from "./chainEnds";
import { rewindDeferredOpener } from "./openerDeferral";
import { rollbackLoreFired } from "./loreFired";
import { rollbackChanceDraws } from "./rolls";
import { rollbackChecks } from "./storyCheckDraws";
import { rollbackAgendaProposals } from "./agendaProposals";
import { rollbackPromises } from "@memory/promises/state";
import { rollbackWitness } from "@memory/witness/state";
import { rollbackRumors } from "@memory/rumors/state";
import { gameLayer } from "@engine/validate/gameLayer";
import { rollbackPatterns } from "./patternsPort";
import { rollbackRecap } from "./recapPort";
import { rollbackTensionHistory } from "./tensionState";
import type { RuntimeExtras } from "./types";
import { rollbackObservations } from "./observationRecords";

// The mutation contract spans every store, so the composition lives in one place
// rather than in the manager's line budget. What is *not* here: the engine's own restore (it owns
// the history) and the decision of what "unavailable" means to a player (narrative.ts).
export type RollbackListener = (messageId: number, window: SharedReadWindow, kind?: RollbackKind) => void;

export interface RollbackDeps {
  engine: StoryEngine;
  journal: SessionJournal;
  ownership: RunOwnership;
  context: () => { lastMessageId: number; chatLength: number; journal: JournalContext };
  memory: { rollbackFromMessage: (messageId: number, boundary: number) => unknown; updateInjection: () => unknown };
  stagecraft: { revertAppliedSince: (messageId: number) => Promise<unknown> };
  pacing: { replayCommitted: () => unknown; updateSteering: () => unknown };
  /** The expansion cache is built from the blackboard, which the rollback just restored. */
  revalidateExpansion: () => unknown;
  restoreExpansion: (boundary: number) => unknown;
  restoreLiving?: (boundary: number, run: RunGuard) => unknown;
  livingMovedAfter?: (boundary: number) => boolean;
  extras: () => RuntimeExtras;
  refreshRequirements: () => void;
  reapplyCheckpoint: (messageId: number) => Promise<void>;
  persist: () => Promise<void>;
  notify: () => void;
  notices: { lastRollback: RollbackNotice | null; rollbackUnavailable: RollbackUnavailable | null; lastOutcome?: RollbackRecord | null };
  setStatus: (status: string) => void;
  onApplied: RollbackListener;
}

export const LOST_CHECKPOINT = "the story reached a checkpoint its graph no longer has and resumed on its trail";

export const repairActiveCheckpoint = (engine: Pick<StoryEngine, "ensureActiveCheckpoint">, note: (detail: string) => void): void => {
  const detail = engine.ensureActiveCheckpoint();
  if (detail) note(detail);
};

export interface RollbackRecord {
  seq: number;
  result: "applied" | "noop" | "history-unavailable";
  fromMessage: number | null;
  reason?: string;
  at: string;
}

export const rollbackRecord = (previous: RollbackRecord | null | undefined, messageId: number, outcome: RollbackOutcome, at: string): RollbackRecord => {
  const finite = Number.isFinite(messageId);
  const reason = !finite ? "no usable message id" : outcome.ok ? undefined : `oldest restorable boundary ${outcome.oldest.boundary} (message ${outcome.oldest.messageId})`;
  return { seq: (previous?.seq ?? 0) + 1, result: outcome.ok ? outcome.result : outcome.reason, fromMessage: finite ? messageId : null, ...(reason ? { reason } : {}), at };
};

const historyNote = (messageId: number, oldest: { boundary: number }): string =>
  `message ${messageId} is older than what this chat can reconstruct (oldest boundary ${oldest.boundary}); the messages the edit invalidated were dropped and the story was not stepped back`;

const keepsSelfInjection = (id: number | null, messageId: number, kind?: RollbackKind): boolean =>
  typeof id !== "number" || id < messageId || (id === messageId && kind !== undefined && kind !== "delete");

export async function runRollback(deps: RollbackDeps, messageId: number, decoded?: DecodeJournal, kind?: RollbackKind, removed?: number): Promise<RollbackOutcome> {
  const outcome = await rollbackOnce(deps, messageId, decoded, kind, removed);
  deps.notices.lastOutcome = rollbackRecord(deps.notices.lastOutcome, messageId, outcome, new Date().toISOString());
  return outcome;
}

async function rollbackOnce(deps: RollbackDeps, messageId: number, decoded?: DecodeJournal, kind?: RollbackKind, removed?: number): Promise<RollbackOutcome> {
  if (!Number.isFinite(messageId)) return { ok: true, result: "noop" };
  const { engine } = deps;
  const run = beginRun(deps.ownership);
  const lapsed: RollbackOutcome = { ok: true, result: "noop" };
  if (deps.extras().memory?.chapters?.length && !chapterKit()) {
    await loadChapterKit();
    if (!run.stillOwns()) return lapsed;
  }
  const extras = deps.extras();
  if (decoded) {
    deps.journal.record("story", decoded.summary, deps.context().journal, decoded.note);
    extras.journal = deps.journal.getRecords();
  }
  // The rows a rollback would have dropped still go, whatever the engine can restore: they are
  // claims about messages that no longer say what they said.
  const quarantine = () => {
    deps.memory.rollbackFromMessage(messageId, engine.serialize().boundary);
    extras.judge = dropJudgeCallsAfter(extras.judge, messageId);
    if (extras.modelCalls) extras.modelCalls = rollbackModelCalls(extras.modelCalls, messageId);
    extras.firedNpcRepliesAt = extras.firedNpcRepliesAt ?? {};
    const mutation = kind ? { kind, removed } : undefined;
    rewindNpcReplies(extras.firedNpcReplies, extras.firedNpcRepliesAt, messageId, mutation);
    if (extras.onEnterPosts) extras.onEnterPosts = rewindOnEnterPosts(extras.onEnterPosts, messageId, mutation);
    if (extras.cuedLines) extras.cuedLines = rewindCuedLines(extras.cuedLines, messageId, mutation);
    if (extras.speech) extras.speech = rewindSpeech(extras.speech, messageId, mutation);
    if (extras.chainEnds) extras.chainEnds = rewindChainEnds(extras.chainEnds, messageId, mutation);
    const deferred = rewindDeferredOpener(extras.deferredOpener, messageId, mutation);
    if (deferred) extras.deferredOpener = deferred; else delete extras.deferredOpener;
    if (!keepsSelfInjection(extras.lastSelfInjectionMessageId, messageId, kind)) extras.lastSelfInjectionMessageId = null;
    extras.extraction.audits = extras.extraction.audits.filter((audit) => audit.window.to < messageId);
    extras.lore = rollbackLoreFired(extras.lore, messageId);
    if (extras.chance) extras.chance = rollbackChanceDraws(extras.chance, messageId);
    if (extras.checks) extras.checks = rollbackChecks(extras.checks, messageId);
    if (extras.observations) extras.observations = rollbackObservations(extras.observations, messageId);
    if (extras.polish) extras.polish = extras.polish.filter((row) => row?.messageId < messageId);
    if (extras.agendaProposals) extras.agendaProposals = rollbackAgendaProposals(extras.agendaProposals, messageId);
    if (extras.promises) extras.promises = rollbackPromises(extras.promises, messageId);
    if (extras.witness) extras.witness = rollbackWitness(extras.witness, messageId);
    if (extras.rumors) extras.rumors = rollbackRumors(extras.rumors, messageId);
    if (extras.cues) extras.cues = gameLayer()?.cues.rollbackCues(extras.cues, messageId, engine.serialize().boundary) ?? extras.cues;
    if (extras.echoes) extras.echoes = gameLayer()?.echoes.rollbackEchoes(extras.echoes, messageId, engine.serialize().boundary) ?? extras.echoes;
    if (extras.recap) extras.recap = rollbackRecap(extras.recap, engine.serialize().boundary);
    if (extras.patterns) extras.patterns = rollbackPatterns(extras.patterns, engine.serialize().boundary);
    extras.tension = { ...extras.tension, history: rollbackTensionHistory(extras.tension.history, messageId) };
    engine.clampToChat(deps.context().chatLength);
    engine.discardPendingFrom(messageId);
  };
  // One path for both ways the history can be gone: nothing retained precedes the message, or
  // the boundary it names has no snapshot left. Either way the player is told, the journal says why,
  // and what the edit invalidated is dropped (the second route used to return in silence).
  const unavailable = async (oldest: { boundary: number; messageId: number }): Promise<RollbackOutcome> => {
    quarantine();
    await deps.stagecraft.revertAppliedSince(messageId);
    if (!run.stillOwns()) return lapsed;
    deps.notices.rollbackUnavailable = { messageId, checkpointName: engine.activeCheckpoint?.name ?? "this point", oldest, at: new Date().toISOString() };
    deps.journal.record("story", "edit past the retained history", deps.context().journal, historyNote(messageId, oldest));
    deps.memory.updateInjection();
    await deps.persist();
    if (!run.stillOwns()) return lapsed;
    deps.notify();
    return { ok: false, reason: "history-unavailable", oldest };
  };
  const boundary = engine.boundaryBeforeMessage(messageId);
  // A memory pass may have reacted to this message even when no blackboard write made a transition.
  // The ENGINE then has nothing to restore while every other store still does, and treating the whole
  // mutation as a no-op was exactly how live path kept the wounded ledger value and the
  // retired belief while their pure helpers were green. The horizon is checked FIRST: an edit that
  // reaches past what the chat can reconstruct is the one case where "the engine did not act on it"
  // is not a reason to stay quiet.
  if (boundary === null) return unavailable(engine.historyFrom());
  const settleInPlace = async (): Promise<RollbackOutcome> => {
    quarantine();
    // A curator write applied at a boundary that consumed the edited message was proposed from the
    // old text, whether or not the engine moved. The blackboard did not move, so the expansion
    // basis stands and is deliberately not revalidated.
    await deps.stagecraft.revertAppliedSince(messageId);
    if (!run.stillOwns()) return lapsed;
    deps.memory.updateInjection();
    await deps.persist();
    if (!run.stillOwns()) return lapsed;
    deps.notify();
    return { ok: true, result: "noop" };
  };
  if (!engine.shouldRollbackFromMessage(messageId) && !deps.livingMovedAfter?.(boundary)) return settleInPlace();
  const before = engine.activeCheckpoint?.id ?? null;
  const outcome = engine.rollbackTo(boundary);
  if (!outcome.ok) return unavailable(outcome.oldest);
  if (outcome.result !== "applied") return settleInPlace();
  await deps.restoreLiving?.(engine.serialize().boundary, run);
  if (!run.stillOwns()) return lapsed;
  deps.notices.rollbackUnavailable = null;
  const current = deps.context();
  const window = getChatWindow(engine.serialize().checkpointStartedMessageId, current.lastMessageId);
  quarantine();
  deps.restoreExpansion(engine.serialize().boundary);
  repairActiveCheckpoint(engine, (detail) => deps.journal.record("story", LOST_CHECKPOINT, deps.context().journal, detail));
  await deps.stagecraft.revertAppliedSince(messageId);
  if (!run.stillOwns()) return lapsed;
  deps.pacing.replayCommitted();
  deps.revalidateExpansion();
  deps.refreshRequirements();
  await deps.reapplyCheckpoint(messageId);
  if (!run.stillOwns()) return lapsed;
  deps.pacing.updateSteering();
  deps.memory.updateInjection();
  await deps.persist();
  if (!run.stillOwns()) return lapsed;
  const checkpointName = engine.activeCheckpoint?.name ?? "an earlier point";
  if ((engine.activeCheckpoint?.id ?? null) !== before) {
    deps.notices.lastRollback = { checkpointName, playerName: engine.activeCheckpoint?.player_name ?? null, at: new Date().toISOString(), ...(kind ? { kind } : {}) };
    deps.setStatus(`Stepped back to ${checkpointName}`);
  }
  deps.onApplied(messageId, window, kind);
  deps.notify();
  return { ok: true, result: "applied" };
}
