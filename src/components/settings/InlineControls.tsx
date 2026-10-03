import type { RuntimeManager } from "@runtime/index";
import type { RuntimeSnapshot } from "@runtime/types";
import { INLINE_CATEGORIES, INLINE_LEVELS, INLINE_WINDOW_MAX, PLAYER_LEVEL_CAP, type InlineLevel } from "@runtime/settingsModel";
import { INLINE_CATEGORY_LABELS } from "@runtime/messageInspector";
import { INLINE_CATEGORY_HELP, INLINE_LEVEL_LABELS } from "@features/inlineCopy";
import { Advanced, CheckRow, FieldLabel } from "./Field";

interface GroupProps {
  snapshot: RuntimeSnapshot;
  manager: RuntimeManager;
}

export const InlineControls = ({ snapshot, manager }: GroupProps) => {
  const inline = snapshot.ui.inline;
  const effective = snapshot.inline.level;
  const authorView = snapshot.ui.authorView;
  const offered = INLINE_LEVELS.filter((level) => authorView || level <= PLAYER_LEVEL_CAP);
  return (
    <div id="so-inline-settings" className="flex flex-col gap-1 text-sm">
      <div className="flex flex-col gap-1">
        <FieldLabel htmlFor="so-inline-level" setting="display.inline.level" />
        <select id="so-inline-level" value={authorView ? inline.level : effective}
          onChange={(event) => manager.setInlineSettings({ level: Number(event.target.value) as InlineLevel })}>
          {offered.map((level) => <option key={level} value={level}>{INLINE_LEVEL_LABELS[level]}</option>)}
        </select>
      </div>
      {inline.level > 0 && (
        <Advanced id="so-inline-advanced" label="Which notes">
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {INLINE_CATEGORIES.map((category) => (
              <span key={category} data-so="inline-category" data-category={category}>
                <CheckRow className="text-xs" checked={inline.categories[category] !== false} label={INLINE_CATEGORY_LABELS[category]} help={INLINE_CATEGORY_HELP[category]}
                  onChange={(on) => manager.setInlineSettings({ categories: { ...inline.categories, [category]: on } })} />
              </span>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <FieldLabel htmlFor="so-inline-window" setting="display.inline.window" />
            <input id="so-inline-window" type="number" min={1} max={INLINE_WINDOW_MAX} className="st-input w-20" value={inline.window}
              onChange={(event) => manager.setInlineSettings({ window: Math.min(INLINE_WINDOW_MAX, Math.max(1, Math.round(Number(event.target.value) || 1))) })} />
          </div>
        </Advanced>
      )}
    </div>
  );
};

export default InlineControls;
