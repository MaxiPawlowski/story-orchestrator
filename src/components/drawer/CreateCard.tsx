import { useState } from "react";
import { nearDupAdvice, type CreateCuratorOp, type CuratorOpRecord, type CuratorProposalRecord } from "@stagecraft/index";
import type { RuntimeManager } from "@runtime/index";
import { Button } from "@components/ui/Button";
import { StatusText } from "@components/ui/StatusText";

const CREATE_STATUS: Record<CuratorOpRecord["status"], string> = {
  pending: "waiting for you",
  accepted: "created at the next turn",
  rejected: "declined",
  applied: "created",
  failed: "could not be created",
  "revert-failed": "a rollback could not delete it — try again",
  "externally-edited": "edited after it was created, so the rollback kept it",
};

const keyList = (text: string) => text.split(",").map((key) => key.trim()).filter(Boolean);

export const createStatusText = (entry: CuratorOpRecord): string =>
  entry.status === "pending" && entry.message === "reverted" ? "deleted by a rollback — create it again to write it back" : CREATE_STATUS[entry.status];

// A new entry is never bulk-accepted: one card, one decision, and what the author edits here is
// exactly what the next boundary writes into the story's own lorebook.
export const CreateCard = ({ record, index, entry, op, manager }: {
  record: CuratorProposalRecord;
  index: number;
  entry: CuratorOpRecord;
  op: CreateCuratorOp;
  manager: RuntimeManager;
}) => {
  const [keys, setKeys] = useState(op.keys.join(", "));
  const [text, setText] = useState(op.text);
  const decidable = entry.status === "pending";
  const edited = keys !== op.keys.join(", ") || text !== op.text;
  const accept = () => void manager.setCuratorOpDecision(record.id, index, "accepted", edited ? { ...op, keys: keyList(keys), text } : undefined);
  return (
    <div data-so="curator-op" data-kind="create" className="border-t border-solid border-[var(--so-line)] mt-1 pt-1">
      <div className="opacity-100">new entry “{op.comment}” in {op.lorebook} <span className="opacity-70">· {createStatusText(entry)}</span></div>
      {(entry.nearDups ?? []).map((dup) => (
        <StatusText as="div" tone="warn" key={dup.comment} data-so="curator-near-dup" data-band={dup.band ?? ""}>{nearDupAdvice(dup)}</StatusText>
      ))}
      {entry.status === "failed" && entry.message && <StatusText as="div" tone="error">{entry.message}</StatusText>}
      {decidable ? (
        <>
          <label className="flex flex-col gap-1">
            <span className="opacity-70">Keys (comma separated)</span>
            <input data-so="curator-create-keys" className="text_pole w-full" value={keys} onChange={(event) => setKeys(event.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="opacity-70">Entry text</span>
            <textarea data-so="curator-text" className="text_pole w-full" rows={3} value={text} onChange={(event) => setText(event.target.value)} />
          </label>
          <div className="flex gap-2 flex-wrap">
            <Button data-so="curator-accept" disabled={!keyList(keys).length || !text.trim()} onClick={accept}>Create it</Button>
            <Button data-so="curator-reject" className="opacity-80" onClick={() => void manager.setCuratorOpDecision(record.id, index, "rejected")}>Decline</Button>
          </div>
        </>
      ) : (
        <>
          <div className="opacity-70">keys: {op.keys.join(", ")}</div>
          <div className="opacity-70 whitespace-pre-wrap">{op.text}</div>
        </>
      )}
    </div>
  );
};

export default CreateCard;
