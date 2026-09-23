import type { RollbackOutcome, StoryEngine } from "@engine/index";
import type { SharedReadWindow } from "@extraction/index";
import { getChatWindow } from "@extraction/index";
import type { RollbackNotice, RollbackUnavailable } from "./narrative";
import type { JournalContext, SessionJournal } from "./journal";
import { dropJudgeCallsAfter } from "@judge/index";
import type { RuntimeExtras } from "./types";

// v2.3 plan 04. The mutation contract spans every store, so the composition lives in one place
// rather than in the manager's line budget. What is *not* here: the engine's own restore (it owns
// the history) and the decision of what "unavailable" means to a player (narrative.ts).
export interface RollbackDeps {
  engine: StoryEngine;
  journal: SessionJournal;
  context: () => { lastMessageId: number; chatLength: number; journal: JournalContext };
  memory: { rollbackFromMessage: (messageId: number, boundary: number) => unknown; updateInjection: () => unknown };
  stagecraft: { revertAppliedSince: (messageId: number) => Promise<unknown> };
  pacing: { replayCommitted: () => unknown; updateSteering: () => unknown };
  /** The expansion cache is built from the blackboard, which the rollback just restored (v2.3 plan 04). */
  revalidateExpansion: () => unknown;
  extras: () => RuntimeExtras;
  refreshRequirements: () => void;
  reapplyCheckpoint: (messageId: number) => Promise<void>;
  dropReadsAfter: (messageId: number) => Promise<void>;
  persist: () => Promise<void>;
  notify: () => void;
  notices: { lastRollback: RollbackNotice | null; rollbackUnavailable: RollbackUnavailable | null };
  setStatus: (status: string) => void;
  onApplied: (messageId: number, window: SharedReadWindow) => void;
}

const historyNote = (messageId: number, oldest: { boundary: number }): string =>
  `message ${messageId} is older than what this chat can reconstruct (oldest boundary ${oldest.boundary}); the messages the edit invalidated were dropped and the story was not stepped back`;

export async function runRollback(deps: RollbackDeps, messageId: number): Promise<RollbackOutcome> {
  const { engine } = deps;
  const extras = deps.extras();
  // The rows a rollback would have dropped still go, whatever the engine can restore: they are
  // claims about messages that no longer say what they said.
  const quarantine = () => {
    deps.memory.rollbackFromMessage(messageId, engine.serialize().boundary);
    extras.judge = dropJudgeCallsAfter(extras.judge, messageId);
    extras.extraction.audits = extras.extraction.audits.filter((audit) => audit.window.to < messageId);
  };
  const boundary = engine.boundaryBeforeMessage(messageId);
  // A memory pass may have reacted to this message even when no blackboard write made a transition.
  // The ENGINE then has nothing to restore while every other store still does, and treating the whole
  // mutation as a no-op was exactly how M3/M4's live path kept the wounded ledger value and the
  // retired belief while their pure helpers were green. The horizon is checked FIRST: an edit that
  // reaches past what the chat can reconstruct is the one case where "the engine did not act on it"
  // is not a reason to stay quiet (E1).
  if (boundary === null) {
    // E1. The history that would reach this edit is gone. Say so, drop what the edit invalidates,
    // and offer the two ways out — never the silence the review found.
    quarantine();
    const oldest = engine.historyFrom();
    deps.notices.rollbackUnavailable = { messageId, checkpointName: engine.activeCheckpoint?.name ?? "this point", oldest, at: new Date().toISOString() };
    deps.journal.record("story", "edit past the retained history", deps.context().journal, historyNote(messageId, oldest));
    await deps.persist();
    deps.notify();
    return { ok: false, reason: "history-unavailable", oldest };
  }
  if (!engine.shouldRollbackFromMessage(messageId)) {
    quarantine();
    deps.memory.updateInjection();
    await deps.persist();
    await deps.dropReadsAfter(messageId);
    deps.notify();
    return { ok: true, result: "noop" };
  }
  const outcome = engine.rollbackTo(boundary);
  if (!outcome.ok || outcome.result !== "applied") return outcome;
  deps.notices.rollbackUnavailable = null;
  const current = deps.context();
  const window = getChatWindow(engine.serialize().checkpointStartedMessageId, current.lastMessageId);
  quarantine();
  await deps.stagecraft.revertAppliedSince(messageId);
  deps.pacing.replayCommitted();
  deps.revalidateExpansion();
  deps.refreshRequirements();
  await deps.reapplyCheckpoint(messageId);
  deps.pacing.updateSteering();
  deps.memory.updateInjection();
  await deps.persist();
  const checkpointName = engine.activeCheckpoint?.name ?? "an earlier point";
  deps.notices.lastRollback = { checkpointName, at: new Date().toISOString() };
  deps.setStatus(`Stepped back to ${checkpointName}`);
  deps.onApplied(messageId, window);
  deps.notify();
  return { ok: true, result: "applied" };
}
