import { useEffect, useRef } from "react";
import type { InlineView } from "@runtime/inlineTimeline";
import { inspectMessage, stepMessage } from "@runtime/messageInspector";
import type { BoundaryChange, BoundaryDigest } from "@runtime/boundaryDigest";
import { gateLeafText } from "@runtime/gateReadout";
import { IconButton } from "@components/ui/IconButton";
import { Button } from "@components/ui/Button";
import { Badge } from "@components/ui/Badge";
import { InlineDetail, type InlineActions } from "../inline/InlineDetail";
import "./author.css";

export interface MessageInspectorProps {
  view: InlineView;
  messageId: number;
  onStep?: (messageId: number) => void;
  onOpenAuthor?: () => void;
  actions?: InlineActions;
}

const BY_LABEL: Record<BoundaryChange["by"], string> = { read: "read", code: "code", "re-check": "re-check", engine: "engine" };

const Changes = ({ digest }: { digest: BoundaryDigest }) => (digest.changes.length ? (
  <ul className="so-inspect-list">
    {digest.changes.map((change) => (
      <li key={change.key} data-so="inspector-change" data-key={change.key}>
        <span>{change.label}</span> <span className="so-mono">{change.before} → {change.after}</span> <span className="so-muted">({BY_LABEL[change.by]})</span>
      </li>
    ))}
  </ul>
) : <p className="so-muted">No value changed at boundary {digest.boundary}.</p>);

const Why = ({ digest }: { digest: BoundaryDigest }) => {
  if (digest.fired) {
    const row = digest.gates[0];
    return (
      <p data-so="inspector-why" data-fired="true">
        Moved {digest.fired.fromName} → {digest.fired.toName}{digest.source === "manual" ? " by an author move" : row ? `: ${row.leaves.map(gateLeafText).join("; ")}` : ""}.
      </p>
    );
  }
  const open = digest.gates.filter((row) => !row.met);
  return (
    <div data-so="inspector-why" data-fired="false">
      <p>Stayed at {digest.stayedAt?.name ?? "this checkpoint"}. {digest.gates.length ? "No transition fired." : "It has no way out."}</p>
      {open.length > 0 && (
        <ul className="so-inspect-list">
          {open.map((row) => (
            <li key={row.to} data-so="inspector-gate">
              <span>→ {row.toName}: </span>{row.leaves.filter((leaf) => !leaf.met).map(gateLeafText).join("; ")}
            </li>
          ))}
        </ul>
      )}
      {digest.discarded > 0 && <p className="so-muted">{digest.discarded} queued write{digest.discarded === 1 ? " was" : "s were"} discarded.</p>}
    </div>
  );
};

export const MessageInspector = ({ view, messageId, onStep, onOpenAuthor, actions }: MessageInspectorProps) => {
  const inspection = inspectMessage(view, messageId);
  const ref = useRef<HTMLElement | null>(null);
  const previous = stepMessage(view, messageId, -1);
  const next = stepMessage(view, messageId, 1);
  const boundaries = inspection.boundaries.map((digest) => digest.boundary);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, [messageId]);
  const empty = !inspection.boundaries.length && !inspection.sections.length && !inspection.health.length && !inspection.prompt && !inspection.raw.length;
  return (
    <section ref={ref} tabIndex={-1} id="so-inspector" data-mesid={messageId} aria-label={`Message ${messageId}`} className="so-inspector">
      <header className="so-inspector-head">
        <h3 className="so-inspector-title">Message {messageId}{boundaries.length ? <span className="so-muted"> · boundary {boundaries.join(", ")}</span> : null}</h3>
        <span className="so-inspector-step">
          <IconButton size="sm" icon="fa-chevron-left" label="Previous message" data-so="inspector-prev" disabled={previous === null || !onStep}
            onClick={() => { if (previous !== null) onStep?.(previous); }} />
          <IconButton size="sm" icon="fa-chevron-right" label="Next message" data-so="inspector-next" disabled={next === null || !onStep}
            onClick={() => { if (next !== null) onStep?.(next); }} />
        </span>
      </header>
      {!inspection.inWindow && <p data-so="inspector-outside" className="so-muted">This message is older than the timeline window, so only what is still recorded shows.</p>}
      {empty && <p data-so="inspector-empty" className="so-muted">Nothing the story recorded is tied to this message.</p>}
      {inspection.boundaries.map((digest) => (
        <div key={digest.boundary} className="so-inspector-boundary">
          <section data-so="inspector-section" data-category="changed">
            <h4>What changed</h4>
            <Changes digest={digest} />
          </section>
          <section data-so="inspector-section" data-category="why">
            <h4>Why</h4>
            <Why digest={digest} />
          </section>
        </div>
      ))}
      {inspection.prompt && (
        <section data-so="inspector-section" data-category="prompt">
          <h4>Prompt <span className="so-muted">{inspection.prompt.blocks.length} block{inspection.prompt.blocks.length === 1 ? "" : "s"} · {
            inspection.prompt.blocks.reduce((sum, block) => sum + block.chars, 0).toLocaleString()} chars</span></h4>
          <ul className="so-inspect-list">
            {inspection.prompt.blocks.map((block) => <li key={block.key}><span className="so-mono">{block.key}</span> <span className="so-muted">depth {block.depth} · {block.chars} chars</span></li>)}
          </ul>
        </section>
      )}
      {inspection.health.length > 0 && (
        <section data-so="inspector-section" data-category="health">
          <h4>Health</h4>
          <InlineDetail items={inspection.health} showDetail showActions actions={actions} />
        </section>
      )}
      {inspection.sections.map((section) => (
        <section key={section.category} data-so="inspector-section" data-category={section.category}>
          <h4>{section.label}</h4>
          <InlineDetail items={section.items} showDetail showActions actions={actions} />
        </section>
      ))}
      {inspection.raw.length > 0 && (
        <section data-so="inspector-section" data-category="raw">
          <h4>Raw <Badge>level 4</Badge></h4>
          <InlineDetail items={inspection.raw} showDetail showActions={false} />
        </section>
      )}
      {onOpenAuthor && (
        <div className="so-inspector-foot">
          <Button size="sm" variant="ghost" icon="fa-up-right-from-square" data-so="inspector-open-author" onClick={onOpenAuthor}>Open in Author page</Button>
        </div>
      )}
    </section>
  );
};

export default MessageInspector;
