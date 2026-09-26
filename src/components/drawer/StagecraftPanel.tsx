import { useState } from "react";
import { decidedOp, isNoteOp, previewCuratorOp, wardenFamilyOf, type CuratorOp, type CuratorOpRecord, type CuratorProposalRecord } from "@stagecraft/index";
import { wordDiff } from "@utils/wordDiff";
import type { RuntimeSnapshot } from "@runtime/types";
import type { RuntimeManager } from "@runtime/index";
import { MessageCitation } from "./MessageCitation";

const STATUS_LABELS: Record<CuratorOpRecord["status"], string> = {
  pending: "waiting for you",
  accepted: "applies at the next turn",
  rejected: "declined",
  applied: "written",
  failed: "could not be written",
  "revert-failed": "a rollback could not restore it — try again",
  "externally-edited": "changed outside this story after the write, so the rollback left it alone",
};

const NOTE_LABELS: Record<CuratorOpRecord["status"], string> = {
  pending: "waiting for you",
  accepted: "goes into the next reply's prompt",
  rejected: "not used",
  applied: "added to a reply's prompt",
  failed: "could not be added",
  "revert-failed": "a rollback could not withdraw it",
  "externally-edited": "changed outside this story after the write",
};

const statusLabel = (entry: CuratorOpRecord): string => {
  if (!isNoteOp(entry.op)) return STATUS_LABELS[entry.status];
  if (entry.message === "lapsed") return "lapsed: a newer reply came first";
  if (entry.message === "reverted") return "withdrawn: the reply was rolled back";
  return NOTE_LABELS[entry.status];
};

const editableText = (op: CuratorOp): string | null => {
  if (op.kind === "note") return op.text;
  if (op.kind === "rewrite") return op.text;
  if (op.kind === "patch") return op.replace;
  return null;
};

const withText = (op: CuratorOp, text: string): CuratorOp => {
  if (op.kind === "note") return { ...op, text };
  if (op.kind === "rewrite") return { ...op, text };
  if (op.kind === "patch") return { ...op, replace: text };
  return op;
};

const describe = (op: CuratorOp): string => {
  if (op.kind === "note") {
    const family = wardenFamilyOf(op);
    if (family === "agency") return `agency note${op.score !== undefined ? ` (score ${op.score.toFixed(2)})` : ""}`;
    return family === "house-rule" ? "house-rule note" : "continuity note";
  }
  if (op.kind === "enable") return `switch on "${op.comment}"`;
  if (op.kind === "disable") return `switch off "${op.comment}"`;
  if (op.kind === "rewrite") return `rewrite "${op.comment}"`;
  return `patch "${op.comment}" at “${op.anchor}”`;
};

const proposedContent = (entry: CuratorOpRecord, op: CuratorOp): string | null => {
  if (isNoteOp(op) || !entry.before || (op.kind !== "rewrite" && op.kind !== "patch")) return null;
  if (entry.status === "applied" && entry.after) return entry.after.content;
  const preview = previewCuratorOp(op, { lorebook: op.lorebook, comment: op.comment, keys: [], content: entry.before.content, disabled: entry.before.disabled });
  return preview.ok ? preview.content ?? null : null;
};

const DiffView = ({ before, after }: { before: string; after: string }) => (
  <div data-so="curator-diff" className="whitespace-pre-wrap opacity-90">
    {wordDiff(before, after).map((part, index) => (part.kind === "del"
      ? <del key={index} className="text-red-300">{part.text}</del>
      : part.kind === "ins" ? <ins key={index} className="text-green-300">{part.text}</ins> : <span key={index}>{part.text}</span>))}
  </div>
);

// v2.3 plan 05. Which pass read this truth, from which message, how sure it was, and whether another
// store disagrees. A fact with no origin says so rather than implying an extractor read it.
const originText = (provenance: { source: string; pass: string; messageId: number; confidence?: number } | undefined, conflictingValue?: string) => {
  const rest = [
    provenance?.confidence !== undefined ? `${Math.round(provenance.confidence * 100)}% sure` : "",
    conflictingValue ? `another store says ${conflictingValue}` : "",
  ].filter(Boolean);
  return (
    <>
      {provenance ? `${provenance.source} · ${provenance.pass}` : "origin unknown"}
      {provenance && provenance.messageId >= 0 && <> · <MessageCitation messageId={provenance.messageId} /></>}
      {rest.map((part) => ` · ${part}`).join("")}
    </>
  );
};

// The plan-06 review pattern applied to a curator: one card per change, editable before it runs,
// accepted or declined on its own. It lives in the drawer rather than the Studio because the author
// is reviewing mid-play, and the plan-03 import boundary forbids drawer → studio.
const OpCard = ({ record, index, entry, manager, onOpenFact }: {
  record: CuratorProposalRecord;
  index: number;
  entry: CuratorOpRecord;
  manager: RuntimeManager;
  onOpenFact?: (id: string) => void;
}) => {
  const text = editableText(entry.op);
  const [draft, setDraft] = useState(text ?? "");
  const decidable = entry.status === "pending";
  const exact = decidedOp(entry, "accepted");
  const shown = proposedContent(entry, decidable && text !== null ? withText(exact, draft) : exact);
  return (
    <div data-so="curator-op" className="border-t border-solid border-white/10 mt-1 pt-1">
      <div className="opacity-100">{describe(entry.op)} <span className="opacity-60">· {statusLabel(entry)}</span></div>
      {entry.fuzzy && <div data-so="curator-fuzzy" className="opacity-80">near match, {Math.round(entry.fuzzy.score * 100)}%: “{entry.fuzzy.span}”</div>}
      {shown !== null && entry.before && <DiffView before={entry.before.content} after={shown} />}
      {isNoteOp(entry.op) && (entry.op.sources?.length
        ? entry.op.sources.map((source) => (
          <div key={source.id} data-so="warden-fact" data-fact={source.id} className="opacity-80">
            <div>established: {source.text}</div>
            <div data-so="warden-fact-origin" className="opacity-60">
              {originText(source.provenance, source.conflictingValue)}
            </div>
            {/* v2.3 plan 05: the card cites the message a truth was read from, so it has to be able to
                take the author there. Without this the citation is decoration the author must hunt
                through the drawer to use. */}
            {onOpenFact && (
              <button data-so="warden-fact-open" className="menu_button text-[10px]" title="Show this fact where it is edited" onClick={() => onOpenFact(source.id)}>
                {source.id.startsWith("bound:") ? "Show the blackboard" : "Show the fact"}
              </button>
            )}
          </div>
        ))
        : entry.op.facts.map((fact) => <div key={fact} data-so="warden-fact" className="opacity-80">established: {fact}</div>))}
      {isNoteOp(entry.op) && entry.op.rules?.map((rule) => <div key={rule} data-so="warden-rule" className="opacity-80">house rule: {rule}</div>)}
      {entry.status === "failed" && entry.message && <div className="text-red-300">{entry.message}</div>}
      {text !== null && (decidable ? (
        <textarea data-so="curator-text" aria-label={`Text for ${describe(entry.op)}`} className="text_pole w-full" rows={2} value={draft} onChange={(event) => setDraft(event.target.value)} />
      ) : (
        <div className="opacity-70 whitespace-pre-wrap">{text}</div>
      ))}
      {decidable && (
        <div className="flex gap-2 flex-wrap">
          <button
            data-so="curator-accept"
            className="menu_button"
            onClick={() => void manager.setCuratorOpDecision(record.id, index, "accepted", text !== null && draft !== text ? withText(entry.op, draft) : undefined)}
          >Accept</button>
          <button data-so="curator-reject" className="menu_button opacity-80" onClick={() => void manager.setCuratorOpDecision(record.id, index, "rejected")}>Decline</button>
        </div>
      )}
    </div>
  );
};

// Author-only: a curator is system machinery, and what it proposes names lorebook entries and future
// scenes — squarely on the author side of the spoiler checklist.
export const StagecraftPanel = ({ snapshot, manager, onOpenFact }: { snapshot: RuntimeSnapshot; manager: RuntimeManager; onOpenFact?: (id: string) => void }) => {
  const { settings, proposals, lastPass, lastError } = snapshot.stagecraft;
  const scope = snapshot.stagecraftScope ?? [];
  const records = [...proposals].reverse();
  return (
    <div id="so-stagecraft" className="text-xs opacity-80">
      <div className="font-medium opacity-100">World Info curator</div>
      {!settings.curatorEnabled && <div className="opacity-70">Off. Turn it on in settings to let the curator propose lorebook changes from what has happened.</div>}
      {settings.curatorEnabled && !scope.length && <div className="opacity-70">This story lists no lorebook for the curator to edit, so it has nothing to do. Add one on the
        Studio&apos;s Story tab.</div>}
      {settings.curatorEnabled && scope.length > 0 && (
        <div className="opacity-70">
          Watching {scope.join(", ")} · {settings.acceptMode === "auto" ? "changes apply on their own" : settings.acceptMode === "off" ? "observing only, nothing is written" : "changes wait for you"}
        </div>
      )}
      {settings.wardenEnabled && (
        <div data-so="warden-status" className="opacity-70">
          Continuity warden on · {settings.wardenAcceptMode === "auto" ? "notes go in on their own" : settings.wardenAcceptMode === "off" ? "not checking" : "notes wait for you"}
        </div>
      )}
      {lastError && <div className="text-red-300">{lastError}</div>}
      {lastPass && (
        <div data-so="curator-last-pass" title={lastPass.rawResponse || "(empty response)"} className="opacity-60">
          Last read {lastPass.reason}: {lastPass.proposed ? `${lastPass.proposed} change(s)` : "nothing to change"}
          {lastPass.dropped.length ? ` · ${lastPass.dropped.length} discarded` : ""}
          {lastPass.focus ? ` · focused on ${lastPass.focus.shown} of ${lastPass.focus.total} entries` : ""}
        </div>
      )}
      {records.length === 0 ? (
        <div className="opacity-70">No proposals yet. The curator reads the story lorebook at scene breaks and checkpoint changes.</div>
      ) : (
        records.map((record) => (
          <div key={record.id} data-so="curator-proposal" data-curator={record.curator} className="border-t border-solid border-white/10 mt-1 pt-1">
            <div className="opacity-100">{record.curator === "warden" ? (record.reason === "continuity" ? "Continuity warden: " : "Warden: ") : ""}{record.summary}</div>
            <div>{record.checkpointId} · {record.reason} · boundary {record.boundary}{record.appliedAt ? " · applied" : ""}</div>
            {record.ops.map((entry, index) => <OpCard key={`${record.id}-${index}`} record={record} index={index} entry={entry} manager={manager} onOpenFact={onOpenFact} />)}
            {record.dropped.map((line) => <div key={line} className="opacity-50">dropped — {line}</div>)}
          </div>
        ))
      )}
    </div>
  );
};

export default StagecraftPanel;
