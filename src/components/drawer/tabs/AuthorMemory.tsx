import { describeProvenance, originLabel, type MemoryEntry } from "@memory/index";
import type { RuntimeSnapshot } from "@runtime/types";
import type { RuntimeManager } from "@runtime/index";
import { FATE_LABELS } from "../memoryFate";
import { MessageCitation } from "../MessageCitation";

export const AuthorMemoryControls = ({ snapshot, manager }: { snapshot: RuntimeSnapshot; manager: RuntimeManager }) => {
  const lastAudit = snapshot.extraction.audits[snapshot.extraction.audits.length - 1];
  return (
    <div data-so="memory-author-controls" className="flex flex-col gap-1">
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={snapshot.memory.settings.enabled} onChange={(event) => manager.setMemorySettings({ enabled: event.target.checked })} />
        <span>Enabled</span>
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={snapshot.memory.settings.epistemicLedgerCapable} onChange={(event) => manager.setEpistemicLedgerCapable(event.target.checked)} />
        <span>Epistemic/ledger extraction (model-capable)</span>
      </label>
      <div className="opacity-70">Turn off only if your memory model over-infers who knows what or invents entity state — small local models tend to. Never disable purely to save calls.</div>
      <div>Scene count {snapshot.memory.sceneCount}</div>
      {snapshot.memory.backfill?.lastError && <div data-so="memorize-error-detail" className="so-error-text">{snapshot.memory.backfill.lastError}</div>}
      {(snapshot.memory.pinnedOverflow ?? 0) > 0 && <div data-so="pinned-overflow-budget" className="opacity-70">Or raise this tier&apos;s budget.</div>}
      {lastAudit && <div title={`${lastAudit.prompt}\n---\n${lastAudit.rawResponse}`}>Last audit: {lastAudit.id} ({lastAudit.reason})</div>}
    </div>
  );
};

export const AuthorMemoryRowExtras = ({ entry, snapshot, manager }: { entry: MemoryEntry; snapshot: RuntimeSnapshot; manager: RuntimeManager }) => {
  const fate = snapshot.memoryInjection?.fates[entry.id];
  return (
    <>
      {entry.provenance && <span data-so="memory-provenance" title={describeProvenance(entry)}>{entry.provenance.validity}</span>}
      {entry.evidence && <span data-so="memory-evidence" title={entry.evidence}>evidence</span>}
      {entry.locked && <span data-so="locked" title="No extraction or consolidation may retire this row">🔒 locked</span>}
      <span>importance {entry.importance} · {entry.expiration}</span>
      {entry.supersededBy && <span title={`superseded by ${entry.supersededBy}`}>⤳ superseded</span>}
      {entry.foldedInto && <span title={`folded into ${entry.foldedInto}`}>🗜 folded</span>}
      {entry.contradicted && !entry.supersededBy && <span>⚠ contradicted</span>}
      {entry.recallCount > 0 && <span>recall {entry.recallCount}</span>}
      <span data-so="memory-origin" title={describeProvenance(entry)}>{originLabel(entry.provenance)}</span>
      <MessageCitation messageId={entry.provenance?.messageId} />
      {fate && <span data-so="memory-fate" data-fate={fate}>{FATE_LABELS[fate]}</span>}
      <button
        type="button"
        className="menu_button"
        data-so="memory-lock"
        title="Lock: freeze this as the story's truth. No extraction or consolidation may retire it, and a contradicting claim goes to the queue you decide."
        onClick={() => void manager.memoryActions.setMemoryLocked(entry.id, !entry.locked)}
      >{entry.locked ? "Unlock" : "Lock"}</button>
    </>
  );
};
