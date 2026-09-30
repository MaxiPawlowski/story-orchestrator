import type { RuntimeManager } from "@runtime/index";
import type { RuntimeSnapshot } from "@runtime/types";
import HelpTooltip from "@components/studio/HelpTooltip";
import { INLINE_CATEGORIES, INLINE_LEVELS, INLINE_WINDOW_MAX, type InlineLevel } from "@runtime/settingsModel";
import { INLINE_CATEGORY_LABELS } from "@runtime/messageInspector";

interface GroupProps {
  snapshot: RuntimeSnapshot;
  manager: RuntimeManager;
}

const INLINE_LEVEL_LABELS: Record<InlineLevel, string> = {
  0: "Off",
  1: "Story",
  2: "Behind the scenes",
  3: "Author (needs Author view)",
  4: "Raw (needs Author view)",
};

const INLINE_HELP = "Small notes under the messages: where the story moved, what it remembered, which lore it consulted. "
  + "Story and Behind the scenes never show spoilers; the Author levels show only while this chat's Author view is on.";

export const InlineControls = ({ snapshot, manager }: GroupProps) => {
  const inline = snapshot.ui.inline;
  const effective = snapshot.inline.level;
  return (
    <div id="so-inline-settings" className="flex flex-col gap-1 text-sm">
      <label className="flex flex-col gap-1">
        <span>Notes under messages <HelpTooltip title={INLINE_HELP} /></span>
        <select id="so-inline-level" value={inline.level} onChange={(event) => manager.setInlineSettings({ level: Number(event.target.value) as InlineLevel })}>
          {INLINE_LEVELS.map((level) => <option key={level} value={level}>{INLINE_LEVEL_LABELS[level]}</option>)}
        </select>
      </label>
      {effective < inline.level && <div data-so="inline-level-capped" className="text-xs opacity-70">Showing {INLINE_LEVEL_LABELS[effective]} in this chat: turn on Author view for more.</div>}
      {inline.level > 0 && (
        <>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {INLINE_CATEGORIES.map((category) => (
              <label key={category} className="flex items-center gap-1 text-xs">
                <input type="checkbox" data-so="inline-category" data-category={category} checked={inline.categories[category] !== false}
                  onChange={(event) => manager.setInlineSettings({ categories: { ...inline.categories, [category]: event.target.checked } })} />
                <span>{INLINE_CATEGORY_LABELS[category]}</span>
              </label>
            ))}
          </div>
          <label className="flex flex-wrap items-center gap-2 text-xs">
            <span>Only the last</span>
            <input id="so-inline-window" type="number" min={1} max={INLINE_WINDOW_MAX} className="st-input w-20" value={inline.window}
              onChange={(event) => manager.setInlineSettings({ window: Math.min(INLINE_WINDOW_MAX, Math.max(1, Math.round(Number(event.target.value) || 1))) })} />
            <span>messages</span>
          </label>
        </>
      )}
    </div>
  );
};

export default InlineControls;
