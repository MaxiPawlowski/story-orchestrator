import { rearmMovedNotes, type CuratorProposalRecord, type NoteAppliedTo } from "@stagecraft/index";
import { messageRevision } from "./yourMove";

export const rearmNotesFor = (proposals: CuratorProposalRecord[], rows: readonly unknown[]): CuratorProposalRecord[] | null =>
  rearmMovedNotes(proposals, (messageId) => messageRevision(rows[messageId]));

export const appliedToLast = (rows: readonly unknown[]): { noteAppliedTo?: NoteAppliedTo } => {
  const revision = messageRevision(rows.at(-1));
  return revision ? { noteAppliedTo: { messageId: rows.length - 1, revision } } : {};
};
