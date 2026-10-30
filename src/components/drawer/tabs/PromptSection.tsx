import type { RuntimeSnapshot } from "@runtime/types";
import type { RuntimeManager } from "@runtime/index";
import { lorebookFileId } from "@utils/string";
import { NextTurnPanel, type NextTurnOwnerTab } from "../NextTurnPanel";
import { MessageCitation } from "../MessageCitation";
import { StatusText } from "@components/ui/StatusText";

// Author only: what lore-select forced into the latest scan, with each entry's p.
const LoreForced = ({ record }: { record: RuntimeSnapshot["loreForced"] | undefined }) => {
  if (!record) return null;
  const picks = Object.entries(record.p ?? {}).filter(([key]) => key !== "trigger");
  return (
    <div data-so="lore-forced" className="so-console-block">
      <h4>Lore forced this turn</h4>
      <div className="so-muted"><MessageCitation
        messageId={record.messageId}
      /> · {String(record.p?.trigger ?? "")} · {record.fallback ? `fell back (${record.fallback})` : `${record.latencyMs} ms`}</div>
      {picks.length === 0 ? <div className="so-muted">Nothing over the floor; ST's keyword scan ran as usual.</div> : picks.map(([
        title,
        p,
      ]) => <div key={title}>{title} <span className="so-muted">{typeof p === "number" ? `${Math.round(p * 100)}%` : p}</span></div>)}
    </div>
  );
};

// Author only: what ST's scans ACTIVATED for the last loud generation, read from
// WORLD_INFO_ACTIVATED rather than inferred from what was enabled or forced. It never predicts: a dry
// run emits nothing, so there is no honest preview of this.
const LoreFired = ({ evidence }: { evidence: RuntimeSnapshot["loreEvidence"] }) => {
  const last = evidence?.last ?? null;
  return (
    <div id="so-lore-fired" data-so="lore-fired" className="so-console-block">
      <h4>Lore that fired last turn</h4>
      {!last ? (
        <div className="so-muted">No reply has been generated since this chat opened.</div>
      ) : (
        <>
          <div
            className="so-muted"
          >{last.rendered ? "reply rendered" : "no reply"} · {last.scanCount} scan{last.scanCount === 1 ? "" : "s"}{last.nestedScans ? ` (${last.nestedScans} inside a quiet run)` : ""}</div>
          {last.fired.length === 0 ? (
            <div className="so-muted">Nothing fired. ST reports nothing for a scan that activates nothing.</div>
          ) : last.fired.map((entry) => (
            <div key={`${entry.world}.${entry.uid}`} data-so="lore-fired-row" data-origin={entry.origin} className="flex flex-wrap items-center gap-2">
              <span>{entry.comment || `${entry.world} #${entry.uid}`}</span>
              <span className="so-muted">{entry.world}{entry.constant ? " · constant" : ""}</span>
              {entry.origin !== "other" && <span className="st-pill px-1 text-[10px]">{entry.origin}</span>}
            </div>
          ))}
          {last.lost.length > 0 && <StatusText
            as="div"
            tone="warn"
            data-so="lore-lost"
          >Forced but never reached the reply: {last.lost.map((entry) => entry.comment || `${entry.world} #${entry.uid}`).join(", ")}</StatusText>}
          {last.constantMissed.length > 0 && <StatusText
            as="div"
            tone="warn"
            data-so="lore-constant-missed"
          >Constant and enabled for this chat, but did not fire: {last.constantMissed.map((entry) => entry.comment).join(", ")}</StatusText>}
        </>
      )}
    </div>
  );
};

// The scan-gating table, author only and only while scan-time gating is active:
// per gated entry, the story that gates it, the state the last scan loaded (the file's), the state it used,
// and whether it fired.
const flagText = (disabled: boolean | null) => (disabled === null ? "no flag" : disabled ? "off" : "on");

const ScanGateTable = ({ view, evidence }: { view: RuntimeSnapshot["scanGate"]; evidence: RuntimeSnapshot["loreEvidence"] }) => {
  if (!view) return null;
  const fired = evidence?.last?.fired ?? [];
  const firedRow = (lorebook: string, uid: number) => fired.some((entry) => entry.uid === uid && entry.world.trim().toLowerCase() === lorebookFileId(lorebook).toLowerCase());
  return (
    <div id="so-scan-gate" data-so="scan-gate" className="so-console-block">
      <h4>Per-chat lorebook gating: {view.owner === "story" ? "this chat's path" : "no story"}</h4>
      {view.rows.length === 0 ? (
        <div className="so-muted">No gated entry was in the last scan.</div>
      ) : view.rows.map((row) => (
        <div key={`${row.lorebook}.${row.uid}`} data-so="scan-gate-row" data-effective={flagText(row.effectiveDisabled)} className="flex flex-wrap items-center gap-2">
          <span>{row.comment}</span>
          <span className="so-muted">{row.lorebook}{row.gatedBy?.length ? ` · gated by ${row.gatedBy.join(", ")}` : ""} · file {flagText(row.fileDisabled)} · this
            chat {flagText(row.effectiveDisabled)}{firedRow(
            row.lorebook,
            row.uid,
          ) ? " · fired" : ""}</span>
        </div>
      ))}
    </div>
  );
};

const SamplerOverlayRow = ({ overlay }: { overlay: RuntimeSnapshot["samplerOverlay"] }) => {
  if (!overlay) return null;
  const values = Object.entries(overlay.values).map(([key, value]) => `${key} ${value}`).join(", ");
  return (
    <div data-so="next-turn-overlay" className="so-console-block">
      <div className="so-strong">Sampler overlay “{overlay.name}”: {values}</div>
      <div className="so-muted">This checkpoint's replies only; the selected preset is untouched. {overlay.applied ? `Applied to ${overlay.applied} request(s).` : "Not applied yet."}</div>
      {overlay.lastSkipped.length > 0 && <StatusText as="div" tone="warn">Not in the last request: {overlay.lastSkipped.join(", ")}</StatusText>}
      {overlay.unknown.length > 0 && <div className="so-muted">Not sent (not a per-request sampler): {overlay.unknown.join(", ")}</div>}
    </div>
  );
};

export const PromptSection = ({ snapshot, manager, onOpenOwner }: { snapshot: RuntimeSnapshot; manager: RuntimeManager; onOpenOwner: (tab: NextTurnOwnerTab) => void }) => {
  const captures = snapshot.payloadCaptures;
  return (
    <div className="so-console-stack">
      <LoreForced record={snapshot.loreForced} />
      <LoreFired evidence={snapshot.loreEvidence} />
      <ScanGateTable view={snapshot.scanGate} evidence={snapshot.loreEvidence} />
      <SamplerOverlayRow overlay={snapshot.samplerOverlay} />
      <NextTurnPanel snapshot={snapshot} actions={manager.previewActions} onOpenOwner={onOpenOwner} />
      <div className="so-console-block" data-so="payload-captures">
      <h4>Injected prompt payload</h4>
      {captures.length === 0 ? (
        <div className="so-muted">No captures yet. Blocks are recorded when a generation starts.</div>
      ) : (
        captures.map((capture, index) => (
          <div key={capture.at} className="so-console-item">
            <div className="so-strong">
              {index === 0 ? "Latest" : capture.at} · boundary {capture.boundary} · {capture.reason} · {capture.blocks.length} blocks
              {capture.folded ? <span data-so="payload-folded"> · {capture.folded} messages folded</span> : null}
            </div>
            {capture.blocks.length === 0 ? (
              <div className="so-muted">No story blocks injected for this generation.</div>
            ) : (
              capture.blocks.map((block) => (
                <div key={block.key} className="mt-1">
                  <div className="so-strong">{block.key} <span className="so-muted">@depth {block.depth}</span></div>
                  <div className="so-pre so-muted">{block.value}</div>
                </div>
              ))
            )}
          </div>
        ))
      )}
      </div>
    </div>
  );
};
