import type { InlineItem } from "@runtime/inlineTimeline";
import { INLINE_CATEGORY_LABELS } from "@runtime/messageInspector";
import { INLINE_CATEGORIES, type InlineCategory, type InlineLevel } from "@runtime/settingsModel";
import { InlineDetail, type InlineActions } from "./InlineDetail";
import { INLINE_ICONS } from "./inlineIcons";
import { InlineLegend } from "./InlineLegend";

export { INLINE_ICONS };

export interface InlineStripProps {
  messageId: number;
  items: InlineItem[];
  level: InlineLevel;
  expanded: InlineCategory | null;
  onToggle: (category: InlineCategory) => void;
  actions?: InlineActions;
  legend?: boolean;
}

export const InlineStrip = ({ messageId, items, level, expanded, onToggle, actions, legend = false }: InlineStripProps) => {
  const groups = INLINE_CATEGORIES.map((category) => ({ category, items: items.filter((item) => item.category === category) })).filter((group) => group.items.length);
  if (!groups.length) return null;
  const open = groups.find((group) => group.category === expanded) ?? null;
  const author = level >= 3;
  return (
    <div data-so="inline-strip" data-mesid={messageId} data-level={level} className="so-inline-strip">
      <div className="so-inline-chips" role="group" aria-label={`Story notes for message ${messageId}`}>
        {groups.map((group) => (
          <button
            key={group.category}
            type="button"
            data-so="inline-chip"
            data-category={group.category}
            aria-expanded={expanded === group.category}
            aria-label={`${INLINE_CATEGORY_LABELS[group.category]}: ${group.items.length}`}
            title={INLINE_CATEGORY_LABELS[group.category]}
            className="so-inline-chip"
            onClick={() => onToggle(group.category)}
          >
            <i className={INLINE_ICONS[group.category]} aria-hidden="true" />
            {group.items.length > 1 && <span>{group.items.length}</span>}
          </button>
        ))}
        {author && actions && (
          <button
            type="button"
            data-so="inline-inspect"
            className="so-inline-chip"
            title="Open this message in the inspector"
            aria-label={`Inspect message ${messageId}`}
            onClick={() => actions.inspect(messageId)}
          >
            <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
          </button>
        )}
        {legend && <InlineLegend level={level} />}
      </div>
      {open && (
        <div data-so="inline-expanded" data-category={open.category} className="so-inline-panel">
          <InlineDetail items={open.items} showDetail={author} showActions={author} actions={actions} />
        </div>
      )}
    </div>
  );
};

export default InlineStrip;
