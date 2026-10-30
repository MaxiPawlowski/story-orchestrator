import { describeProvenance, originLabel, type MemoryEntry } from "@memory/index";
import type { RuntimeSnapshot } from "@runtime/types";
import type { RuntimeManager } from "@runtime/index";
import { FATE_LABELS } from "../memoryFate";
import { MessageCitation } from "../MessageCitation";
import { Button } from "@components/ui/Button";
import { workspaceNavigation } from "@runtime/workspaceNavigation";
import { settingIntent } from "@runtime/workspaceRoutes";
import { StatusText } from "@components/ui/StatusText";

export const AuthorMemoryControls = ({ snapshot, manager }: { snapshot: RuntimeSnapshot; manager: RuntimeManager }) => {
  const lastAudit = snapshot.extraction.audits[snapshot.extraction.audits.length - 1];
  return (
    <div data-so="memory-author-controls" className="so-console-block">
      <p className="so-muted">Memory and who-knows-what tracking are switched on in settings, for every chat.
        {" "}<button type="button" className="so-link-btn" data-so="memory-open-settings" onClick={() => workspaceNavigation.open(settingIntent("so-epistemic-capable"))}>Memory settings</button></p>
      <div>Scene count {snapshot.memory.sceneCount}</div>
      <Button size="sm" className="self-start" data-so="canon-draft" work={() => manager.draftCanon()}>Draft a checked story-so-far</Button>
      {snapshot.memory.canonDraft && <div data-so="canon-draft-review">
        <div className="whitespace-pre-wrap">{snapshot.memory.canonDraft.text}</div>
        <Button size="sm" variant="primary" onClick={() => void manager.decideCanonDraft(true)}>Use this draft</Button>
        <Button size="sm" onClick={() => void manager.decideCanonDraft(false)}>Discard draft</Button>
      </div>}
      {snapshot.memory.backfill?.lastError && <StatusText as="div" tone="error" data-so="memorize-error-detail">{snapshot.memory.backfill.lastError}</StatusText>}
      {(snapshot.memory.pinnedOverflow ?? 0) > 0 && <div data-so="pinned-overflow-budget" className="so-muted">Or raise this tier&apos;s budget.</div>}
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
      <Button
        type="button"
        data-so="memory-lock"
        title="Lock: freeze this as the story's truth. No extraction or consolidation may retire it, and a contradicting claim goes to the queue you decide."
        onClick={() => void manager.memoryActions.setMemoryLocked(entry.id, !entry.locked)}
      >{entry.locked ? "Unlock" : "Lock"}</Button>
    </>
  );
};
