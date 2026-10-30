import { useId } from "react";
import type { InlineItem } from "@runtime/inlineTimeline";
import { INLINE_RAW_LEVEL, inlineGroups, inlineLineParts, inlineLineText } from "@runtime/inlineLine";
import type { InlineLevel } from "@runtime/settingsModel";
import { INLINE_LINE_COPY } from "@features/inlineCopy";
import { InlineDetail, type InlineActions } from "./InlineDetail";
import { INLINE_ICONS } from "./inlineIcons";

export { INLINE_ICONS };

export interface InlineStripProps {
  messageId: number;
  items: InlineItem[];
  level: InlineLevel;
  expanded: boolean;
  onToggle: () => void;
  actions?: InlineActions;
}

export const INLINE_DETAIL_LEVEL = 3;

export const InlineStrip = ({ messageId, items, level, expanded, onToggle, actions }: InlineStripProps) => {
  const panel = useId();
  const parts = inlineLineParts(items);
  if (!parts.length) return null;
  const author = level >= 3;
  const raw = level >= INLINE_RAW_LEVEL;
  return (
    <div data-so="inline-strip" data-mesid={messageId} data-level={level} className="so-inline-strip">
      <div className="so-inline-head">
        <button type="button" data-so="inline-line" className="so-inline-line-button" aria-expanded={expanded} aria-controls={expanded ? panel : undefined}
          aria-label={`${inlineLineText(parts)}. ${INLINE_LINE_COPY.expand}`} onClick={onToggle}>
          <i className="fa-solid fa-turn-up fa-rotate-90 so-inline-lead" aria-hidden="true" />
          {parts.map((part, index) => (
            <span key={part.category} data-so="inline-part" data-category={part.category} data-count={part.count} title={part.label} className="so-inline-part">
              {index > 0 && <span className="so-inline-sep" aria-hidden="true">·</span>}
              <i className={INLINE_ICONS[part.category]} aria-hidden="true" />
              <span>{part.text}</span>
              {raw && <span data-so="inline-raw-count" className="so-inline-raw">{INLINE_LINE_COPY.raw(part.count)}</span>}
            </span>
          ))}
        </button>
        {author && actions && (
          <button type="button" data-so="inline-inspect" className="so-inline-link" title={INLINE_LINE_COPY.inspectTitle}
            aria-label={`Inspect message ${messageId}`} onClick={() => actions.inspect(messageId)}>
            {INLINE_LINE_COPY.inspect}
          </button>
        )}
      </div>
      {expanded && (
        <div id={panel} data-so="inline-expanded" className="so-inline-panel">
          {inlineGroups(items).map((group) => (
            <div key={group.category} role="group" data-so="inline-group" data-category={group.category} className="so-inline-group"
              aria-label={parts.find((part) => part.category === group.category)?.label}>
              <InlineDetail items={group.items} showDetail={author} detailLevel={INLINE_DETAIL_LEVEL} showActions={author} actions={actions} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default InlineStrip;
