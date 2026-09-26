import { useState } from "react";
import { describeProvenance, isQuarantined, originLabel, type ConflictPair, type EpistemicEntry, type LedgerEntry, type MemoryEntry, type Provenance } from "@memory/index";
import type { RuntimeManager } from "@runtime/runtimeManager";
import type { RuntimeSnapshot } from "@runtime/types";
import { MessageCitation } from "./MessageCitation";

// v2.3 plan 05 (C3). Two stores can disagree about the same thing, and until the author decides, both
// rows are held out of every prompt. This is where the decision is made: keep one side, lock a fact
// as canon, re-read the span the claims came from, or dismiss the pair and let both steer again.
// Author-only — a player never sees the machinery, let alone a claim the story has not settled.

// Newest first, so the pair this pass just found is the one at the top of the queue.
const byNewest = (left: ConflictPair, right: ConflictPair) => right.detectedAt.localeCompare(left.detectedAt);

// Where a side came from, in the same words the Memory tab uses (`originLabel`); a side with no
// message (`messageId -1`) must not print as "message -1" (2026-09-22).
const originText = (provenance: Provenance | undefined, messageId: number | undefined, confidence: number | undefined) => {
  const hasMessage = messageId !== undefined && messageId >= 0;
  const sure = confidence === undefined ? "" : `${Math.round(confidence * 100)}% sure`;
  return (
    <>
      {originLabel(provenance)}
      {hasMessage && <> · <MessageCitation messageId={messageId} /></>}
      {sure && ` · ${sure}`}
    </>
  );
};

const ConflictQueue = ({ snapshot, manager }: { snapshot: RuntimeSnapshot; manager: RuntimeManager }) => {
  // A decision is applied in memory and then written, and the write is the half that can fail: the
  // runtime puts the decision back rather than showing a pair as settled that the next pass will
  // rebuild (see `memoryQueue`). That happens here, where the button was pressed — the pair stays in
  // the queue, and without this line the author would see a click that did nothing.
  const [refused, setRefused] = useState<{ key: string; externallyChanged: string[] } | null>(null);
  const act = async (key: string, run: () => Promise<boolean>) => {
    const done = await run();
    setRefused(done ? null : { key, externallyChanged: manager.memoryActions.lastRefusal?.()?.externallyChanged ?? [] });
  };
  const conflicts = [...(snapshot.memory.conflicts ?? [])].sort(byNewest);
  const paired = new Set(conflicts.flatMap((pair) => pair.sides.map((side) => side.id)));
  const quarantined: MemoryEntry[] = snapshot.memory.entries.filter((entry) => isQuarantined(entry) && !paired.has(entry.id));
  const quarantinedEpistemic: EpistemicEntry[] = (snapshot.memory.epistemic ?? []).filter((entry) => isQuarantined(entry));
  const quarantinedLedger: LedgerEntry[] = (snapshot.memory.ledger ?? []).filter((entry) => isQuarantined(entry) && !paired.has(entry.id));
  if (!conflicts.length && !quarantined.length && !quarantinedEpistemic.length && !quarantinedLedger.length) return null;
  return (
    <div data-so="reconciliation" className="border-t border-solid border-white/10 mt-1 pt-1">
      <div className="font-medium opacity-100">Needs your decision ({conflicts.length})</div>
      <div className="opacity-60">Nothing here steers a reply until you decide. Keep a side, lock a fact as canon, re-read the window, or dismiss and let both stand.</div>
      {refused && (
        <div data-so="decision-refused" data-so-outcome={refused.externallyChanged.length ? "externally-changed" : "put-back"} className="opacity-90">
          Nothing changed: the decision was not written to this chat. Try again.
          {refused.externallyChanged.length > 0 && <span data-so="decision-externally-changed"> {refused.externallyChanged.length} row(s) changed elsewhere while it was saving and
            were left as they are: {refused.externallyChanged.join(", ")}.</span>}
        </div>
      )}
      {conflicts.map((pair) => (
        <div key={pair.key} data-so="conflict-pair" data-key={pair.key} className="mt-1 border-l-2 border-solid border-yellow-500/60 pl-2">
          {pair.sides.map((side) => (
            <div key={side.id} className="flex items-start gap-2">
              <div className="flex-1">
                <div>{side.store === "memory" ? "Fact" : side.store === "scene" ? "Scene" : "Ledger"}: {side.label}</div>
                {side.standing && <div data-so="conflict-standing" className="opacity-60">Established: still steers replies while you decide.</div>}
                <div
                  data-so="conflict-origin"
                  className="opacity-60"
                  title={side.provenance ? describeProvenance(side) : "this row came from before envelopes were recorded"}
                >{originText(side.provenance, side.messageId, side.confidence)}</div>
              </div>
              <button
                className="menu_button"
                data-so="conflict-keep"
                title="Keep this side and retire the other"
                onClick={() => void act(pair.key, () => manager.memoryActions.resolveMemoryConflict(pair.key, side.id))}
              >Keep this</button>
              {side.store === "memory" && <button
                className="menu_button"
                data-so="conflict-lock"
                title="Keep it as canon: no extraction or consolidation may retire it"
                onClick={() => void act(pair.key, () => manager.memoryActions.lockAsCanon(pair.key, side.id))}
              >Lock as canon</button>}
            </div>
          ))}
          <div className="flex gap-2 mt-1">
            <button
              className="menu_button"
              data-so="conflict-reread"
              title="Read the messages these claims came from again"
              onClick={() => void act(pair.key, () => manager.memoryActions.rereadConflictWindow(pair.key))}
            >Re-read the window</button>
            <button
              className="menu_button"
              data-so="conflict-dismiss"
              title="Live with the disagreement: both sides steer replies again and this pair stops being queued"
              onClick={() => void act(pair.key, () => manager.memoryActions.dismissMemoryConflict(pair.key))}
            >Dismiss</button>
          </div>
        </div>
      ))}
      {quarantined.map((entry) => (
        <div key={entry.id} data-so="quarantined" className="mt-1">
          <span className="opacity-60">{entry.provenance?.validity === "conflicted" ? "Conflicted" : "Source removed"}: {entry.text}</span>
          <div className="opacity-50" title={describeProvenance(entry)}>{originText(entry.provenance, entry.provenance?.messageId === -1 ? undefined : entry.provenance?.messageId, undefined)}</div>
          <div className="flex gap-2">
            <button className="menu_button" data-so="reconfirm" onClick={() => void act(entry.id, () => manager.memoryActions.reconfirmMemoryEntry(entry.id))}>Reconfirm — keep it as mine</button>
            <button className="menu_button" data-so="discard-quarantined" onClick={() => void act(entry.id, () => manager.memoryActions.discardQuarantined(entry.id))}>Discard</button>
          </div>
        </div>
      ))}
      {/* A private row is quarantined by the same rollback and reaches no prompt for the same reason,
          so it is the same decision here — it was invisible until 2026-09-22, which made a
          rolled-back `[hiding]` fact unrecoverable and the promise in `activeEpistemic` a comment. */}
      {quarantinedEpistemic.map((entry) => (
        <div key={entry.id} data-so="quarantined" data-so-kind="epistemic" className="mt-1">
          <span className="opacity-60">
            {entry.provenance?.validity === "conflicted" ? "Conflicted" : "Source removed"}: {entry.subject}{" "}
            {entry.hiddenFrom ? `hides from ${entry.hiddenFrom}` : entry.tag === "knows" ? "knows" : entry.tag} {entry.content}
          </span>
          <div className="opacity-50" title={describeProvenance(entry)}>{originText(entry.provenance, entry.provenance?.messageId === -1 ? undefined : entry.provenance?.messageId, undefined)}</div>
          <div className="flex gap-2">
            <button className="menu_button" data-so="reconfirm" onClick={() => void act(entry.id, () => manager.memoryActions.reconfirmMemoryEntry(entry.id))}>Reconfirm — keep it as mine</button>
            <button className="menu_button" data-so="discard-quarantined" onClick={() => void act(entry.id, () => manager.memoryActions.discardQuarantined(entry.id))}>Discard</button>
          </div>
        </div>
      ))}
      {quarantinedLedger.map((entry) => (
        <div key={entry.id} data-so="quarantined" data-so-kind="ledger" className="mt-1">
          <span className="opacity-60">{entry.provenance?.validity === "conflicted" ? "Conflicted" : "Source removed"}: {entry.entity} {entry.field} = {entry.value}</span>
          <div className="opacity-50" title={describeProvenance(entry)}>{originText(entry.provenance, entry.provenance?.messageId === -1 ? undefined : entry.provenance?.messageId, undefined)}</div>
          <div className="flex gap-2">
            <button className="menu_button" data-so="reconfirm" onClick={() => void act(entry.id, () => manager.memoryActions.reconfirmMemoryEntry(entry.id))}>Reconfirm — keep it as mine</button>
            <button className="menu_button" data-so="discard-quarantined" onClick={() => void act(entry.id, () => manager.memoryActions.discardQuarantined(entry.id))}>Discard</button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default ConflictQueue;
