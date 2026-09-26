import { rollbackDerived, type DerivedRecord } from "./derived";
import { rollbackEpistemic } from "./epistemic";
import { rollbackLedger } from "./ledger";
import { dropByMessageId, hashMemoryText, stripLinksAfter } from "./stores";
import { rollbackArcs } from "./arcs";
import type { ArcEntry, MemoryEntry, MemoryStoreState } from "./types";

// Everything a rollback means for memory, in one pure function: the rows a mutation
// invalidated, the derived artifacts built from them, and the three stores that keep their own
// version history. It lives here rather than in the coordinator because it spans five stores and the
// coordinator has a line budget — and because a generic constraint keeps it honest about the shape
// it returns without this module having to know the runtime's own state type.
export interface MemoryRollbackState extends MemoryStoreState {
  shortTermSummaryEnd: number;
  arcs: ArcEntry[];
  epistemic: Parameters<typeof rollbackEpistemic>[0];
  ledger: Parameters<typeof rollbackLedger>[0];
  canon: { text: string; inputHash: string; updatedAt: string } | null;
  verifyDrops: Array<{ entry: MemoryEntry }>;
  derived: DerivedRecord[];
  storyStart: number;
}

export function reverseMemoryState<S extends MemoryRollbackState>(state: S, messageId: number, boundary: number): Partial<S> {
  const dropped = dropByMessageId(state, messageId, boundary);
  const removedIds = new Set(state.entries.filter((entry) => !dropped.entries.some((candidate) => candidate.id === entry.id)).map((entry) => entry.id));
  const reversal = rollbackDerived(state.derived, messageId, removedIds);
  // The hash a dropped exclusion lifted is gone before the rows it kept out are reconsidered: an
  // exclusion is undone by restoring the entry AND forgetting the text it was excluded for.
  const excluded = dropped.excluded.filter((hash) => !reversal.lifted.includes(hash));
  const outputs = new Set(reversal.outputIds);
  // A derived row can itself be input to a later artifact. Remove outputs first, then let every
  // dropped record offer its before-images newest-first. The map makes one id one row and ensures a
  // restored row is stripped of links this cut never had.
  const byId = new Map(dropped.entries.filter((entry) => !outputs.has(entry.id)).map((entry) => [entry.id, entry]));
  reversal.restored.forEach((entry) => {
    if (!excluded.includes(hashMemoryText(entry.text))) byId.set(entry.id, stripLinksAfter(entry, messageId));
  });
  const entries = [...byId.values()];
  let arcs = rollbackArcs(state.arcs, messageId, boundary);
  const staleArcSummaries = new Set(reversal.dropped.filter((record) => record.kind === "arc_summary").flatMap((record) => record.inputs));
  if (staleArcSummaries.size) arcs = arcs.map((arc) => {
    if (!staleArcSummaries.has(arc.id)) return arc;
    const { summary: _summary, ...rest } = arc;
    return rest;
  });
  const stillResolved = new Set(arcs.filter((arc) => arc.status === "resolved").map((arc) => arc.id));
  const canonStale = reversal.reDerive || state.arcs.some((arc) => arc.status === "resolved" && !stillResolved.has(arc.id));
  return {
    entries,
    excluded,
    writeLog: dropped.writeLog,
    arcs,
    epistemic: rollbackEpistemic(state.epistemic, messageId),
    ledger: rollbackLedger(state.ledger, messageId),
    derived: reversal.records,
    verifyDrops: state.verifyDrops.filter((drop) => (drop.entry.messageId ?? -1) < messageId),
    shortTermSummaryEnd: reversal.watermark === null ? state.shortTermSummaryEnd : Math.min(state.shortTermSummaryEnd, reversal.watermark),
    ...(canonStale ? { canon: null } : {}),
    ...(state.storyStart > messageId ? { storyStart: messageId } : {}),
  } as Partial<S>;
}
