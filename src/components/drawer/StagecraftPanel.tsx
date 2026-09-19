import { useState } from "react";
import type { CuratorOp, CuratorOpRecord, CuratorProposalRecord } from "@stagecraft/index";
import type { RuntimeSnapshot } from "@runtime/types";
import type { RuntimeManager } from "@runtime/index";

const STATUS_LABELS: Record<CuratorOpRecord["status"], string> = {
  pending: "waiting for you",
  accepted: "applies at the next turn",
  rejected: "declined",
  applied: "written",
  failed: "could not be written",
};

const editableText = (op: CuratorOp): string | null => {
  if (op.kind === "rewrite") return op.text;
  if (op.kind === "patch") return op.replace;
  return null;
};

const withText = (op: CuratorOp, text: string): CuratorOp => {
  if (op.kind === "rewrite") return { ...op, text };
  if (op.kind === "patch") return { ...op, replace: text };
  return op;
};

const describe = (op: CuratorOp): string => {
  if (op.kind === "enable") return `switch on "${op.comment}"`;
  if (op.kind === "disable") return `switch off "${op.comment}"`;
  if (op.kind === "rewrite") return `rewrite "${op.comment}"`;
  return `patch "${op.comment}" at “${op.anchor}”`;
};

// The plan-06 review pattern applied to a curator: one card per change, editable before it runs,
// accepted or declined on its own. It lives in the drawer rather than the Studio because the author
// is reviewing mid-play, and the plan-03 import boundary forbids drawer → studio.
const OpCard = ({ record, index, entry, manager }: { record: CuratorProposalRecord; index: number; entry: CuratorOpRecord; manager: RuntimeManager }) => {
  const text = editableText(entry.op);
  const [draft, setDraft] = useState(text ?? "");
  const decidable = entry.status === "pending";
  return (
    <div data-so="curator-op" className="border-t border-solid border-white/10 mt-1 pt-1">
      <div className="opacity-100">{describe(entry.op)} <span className="opacity-60">· {STATUS_LABELS[entry.status]}</span></div>
      {entry.status === "failed" && entry.message && <div className="text-red-300">{entry.message}</div>}
      {text !== null && (decidable ? (
        <textarea data-so="curator-text" aria-label={`Text for ${describe(entry.op)}`} className="text_pole w-full" rows={2} value={draft} onChange={(event) => setDraft(event.target.value)} />
      ) : (
        <div className="opacity-70 whitespace-pre-wrap">{text}</div>
      ))}
      {decidable && (
        <div className="flex gap-2 flex-wrap">
          <button data-so="curator-accept" className="menu_button" onClick={() => void manager.setCuratorOpDecision(record.id, index, "accepted", text !== null && draft !== text ? withText(entry.op, draft) : undefined)}>Accept</button>
          <button data-so="curator-reject" className="menu_button opacity-80" onClick={() => void manager.setCuratorOpDecision(record.id, index, "rejected")}>Decline</button>
        </div>
      )}
    </div>
  );
};

// Author-only: a curator is system machinery, and what it proposes names lorebook entries and future
// scenes — squarely on the author side of the spoiler checklist.
export const StagecraftPanel = ({ snapshot, manager }: { snapshot: RuntimeSnapshot; manager: RuntimeManager }) => {
  const { settings, proposals, lastPass, lastError } = snapshot.stagecraft;
  const scope = snapshot.stagecraftScope ?? [];
  const records = [...proposals].reverse();
  return (
    <div id="so-stagecraft" className="text-xs opacity-80">
      <div className="font-medium opacity-100">World Info curator</div>
      {!settings.curatorEnabled && <div className="opacity-70">Off. Turn it on in settings to let the curator propose lorebook changes from what has happened.</div>}
      {settings.curatorEnabled && !scope.length && <div className="opacity-70">This story lists no lorebook for the curator to edit, so it has nothing to do. Add one on the Studio&apos;s Story tab.</div>}
      {settings.curatorEnabled && scope.length > 0 && (
        <div className="opacity-70">
          Watching {scope.join(", ")} · {settings.acceptMode === "auto" ? "changes apply on their own" : settings.acceptMode === "off" ? "observing only, nothing is written" : "changes wait for you"}
        </div>
      )}
      {lastError && <div className="text-red-300">{lastError}</div>}
      {lastPass && (
        <div data-so="curator-last-pass" title={lastPass.rawResponse || "(empty response)"} className="opacity-60">
          Last read {lastPass.reason}: {lastPass.proposed ? `${lastPass.proposed} change(s)` : "nothing to change"}{lastPass.dropped.length ? ` · ${lastPass.dropped.length} discarded` : ""}{lastPass.focus ? ` · focused on ${lastPass.focus.shown} of ${lastPass.focus.total} entries` : ""}
        </div>
      )}
      {records.length === 0 ? (
        <div className="opacity-70">No proposals yet. The curator reads the story lorebook at scene breaks and checkpoint changes.</div>
      ) : (
        records.map((record) => (
          <div key={record.id} data-so="curator-proposal" className="border-t border-solid border-white/10 mt-1 pt-1">
            <div className="opacity-100">{record.summary}</div>
            <div>{record.checkpointId} · {record.reason} · boundary {record.boundary}{record.appliedAt ? " · applied" : ""}</div>
            {record.ops.map((entry, index) => <OpCard key={`${record.id}-${index}`} record={record} index={index} entry={entry} manager={manager} />)}
            {record.dropped.map((line) => <div key={line} className="opacity-50">dropped — {line}</div>)}
          </div>
        ))
      )}
    </div>
  );
};

export default StagecraftPanel;
