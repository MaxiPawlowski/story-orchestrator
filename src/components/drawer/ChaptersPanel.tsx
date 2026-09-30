import { useState } from "react";
import type { ChapterRecord } from "@memory/types";
import type { RuntimeManager } from "@runtime/index";
import type { RuntimeSnapshot } from "@runtime/types";
import { showConfirmPopup } from "@services/STAPI";
import { MessageCitation } from "./MessageCitation";

export interface ChaptersPanelProps {
  snapshot: RuntimeSnapshot;
  manager: RuntimeManager;
  confirm?: (question: string) => Promise<boolean>;
}

const askFirst = (question: string) => showConfirmPopup(question, { okButton: "Yes", cancelButton: "Cancel" });

const STATUS_COPY: Record<ChapterRecord["status"], string> = {
  sealed: "sealed",
  degraded: "sealed without a written summary",
  "author-edited": "edited by you",
};

interface CardProps {
  record: ChapterRecord;
  newest: boolean;
  busy: boolean;
  act: (work: () => Promise<unknown>) => void;
  confirm: (question: string) => Promise<boolean>;
  manager: RuntimeManager;
}

const RecordCard = ({ record, newest, busy, act, confirm, manager }: CardProps) => {
  const [editing, setEditing] = useState(false);
  const [summary, setSummary] = useState(record.summary);
  const [short, setShort] = useState(record.short);
  const save = () => act(async () => {
    if (await manager.chapters.editSummary(record.id, summary, short)) setEditing(false);
  });
  const reseal = () => act(async () => {
    const question = record.status === "author-edited"
      ? "Re-sealing replaces the summary you edited with a newly written one. Re-seal anyway?"
      : "Re-seal this chapter? Its record is written again from the same messages.";
    if (await confirm(question)) await manager.chapters.reseal(record.id);
  });
  const unseal = () => act(async () => {
    if (await confirm(`Unseal "${record.title}"? Its memories go back to the live stores and the record is deleted.`)) await manager.chapters.unseal(record.id);
  });
  return (
    <div data-so="chapter-record" className="border-t border-solid border-white/10 mt-1 pt-1 flex flex-col gap-1">
      <div className="opacity-100">
        <b>{record.title}</b>{record.part > 1 ? ` (part ${record.part})` : ""} · <span data-so="chapter-status">{STATUS_COPY[record.status]}</span>
      </div>
      <div className="opacity-70">
        <MessageCitation messageId={record.range.from} prefix="msg" /> to <MessageCitation messageId={record.range.to} prefix="msg" />
        {` · ${record.checkpoints.length} checkpoints · ${record.tokens.summary}/${record.tokens.short} tokens`}
      </div>
      {editing ? (
        <div className="flex flex-col gap-1">
          <label className="flex flex-col gap-1">
            Summary
            <textarea data-so="chapter-summary-input" className="text_pole" rows={6} value={summary} onChange={(event) => setSummary(event.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            One line
            <textarea data-so="chapter-short-input" className="text_pole" rows={2} value={short} onChange={(event) => setShort(event.target.value)} />
          </label>
          <div className="flex gap-1">
            <button type="button" data-so="chapter-save" className="menu_button" disabled={busy || !summary.trim()} onClick={save}>Save</button>
            <button type="button" className="menu_button" disabled={busy} onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <>
          <div data-so="chapter-summary" className="whitespace-pre-wrap">{record.summary}</div>
          {record.epilogue && <div data-so="chapter-epilogue" className="whitespace-pre-wrap opacity-90">{record.epilogue}</div>}
          {record.consequences.length > 0 && (
            <ul className="m-0 pl-4">
              {record.consequences.map((item) => <li key={item.text}>{item.text} <span className="opacity-60">[{item.sources.join(", ")}]</span></li>)}
            </ul>
          )}
          {record.people.map((person) => <div key={person.rosterId} className="opacity-80">{person.name}: {person.text}</div>)}
          {record.open.map((thread) => <div key={thread.arcId} className="opacity-70">thread, {thread.disposition}: {thread.text}</div>)}
        </>
      )}
      <div className="flex flex-wrap gap-1">
        {!editing && <button type="button" data-so="chapter-edit" className="menu_button" disabled={busy} onClick={() => setEditing(true)}>Edit summary</button>}
        {newest && <button type="button" data-so="chapter-reseal" className="menu_button" disabled={busy} onClick={reseal}>Re-seal</button>}
        {newest && <button type="button" data-so="chapter-unseal" className="menu_button" disabled={busy} onClick={unseal}>Unseal</button>}
      </div>
    </div>
  );
};

// The author's side of a chapter: every record's sections, and the four decisions that change one
// (edit, re-seal, unseal, seal now). Author view only; a player can only flag a summary.
export const ChaptersPanel = ({ snapshot, manager, confirm = askFirst }: ChaptersPanelProps) => {
  const [busy, setBusy] = useState(false);
  const records = snapshot.memory.chapters ?? [];
  const view = snapshot.chapters;
  if (!view?.declared && !records.length) return null;
  const act = (work: () => Promise<unknown>) => {
    setBusy(true);
    void work().finally(() => setBusy(false));
  };
  const sealNow = () => act(async () => {
    if (await confirm(`Seal "${view?.current?.playerTitle}" now? Its memories are folded into a chapter record.`)) await manager.chapters.sealNow();
  });
  return (
    <div id="so-chapters" className="text-xs opacity-90 flex flex-col gap-1">
      <div className="font-medium opacity-100">Chapters</div>
      <div className="opacity-70">Now: {view?.current ? view.current.playerTitle : "no chapter"}{view?.ended ? " · the story has ended" : ""}</div>
      {records.length === 0 && <div className="opacity-70">No chapter sealed yet.</div>}
      {records.map((record, index) => (
        <RecordCard key={record.id} record={record} newest={index === records.length - 1} busy={busy} act={act} confirm={confirm} manager={manager} />
      ))}
      {view?.current && !view.ended && <button type="button" data-so="chapter-seal-now" className="menu_button self-start" disabled={busy} onClick={sealNow}>Seal now</button>}
    </div>
  );
};

export default ChaptersPanel;
