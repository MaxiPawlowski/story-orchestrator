import { useId, useState } from "react";
import { INLINE_CATEGORY_LABELS } from "@runtime/messageInspector";
import { INLINE_CATEGORIES, INLINE_LEVELS, PLAYER_LEVEL_CAP, type InlineLevel } from "@runtime/settingsModel";
import { INLINE_CATEGORY_HELP, INLINE_LEGEND_COPY, INLINE_LEVEL_HELP, INLINE_LEVEL_LABELS } from "@features/inlineCopy";
import { INLINE_ICONS } from "./inlineIcons";

export interface InlineLegendProps {
  level: InlineLevel;
}

export const InlineLegend = ({ level }: InlineLegendProps) => {
  const [open, setOpen] = useState(false);
  const panel = useId();
  const levels = INLINE_LEVELS.filter((entry) => entry > 0 && (level > PLAYER_LEVEL_CAP || entry <= PLAYER_LEVEL_CAP));
  return (
    <>
      <button
        type="button"
        data-so="inline-legend-toggle"
        className="so-inline-chip"
        aria-expanded={open}
        aria-controls={panel}
        aria-label={INLINE_LEGEND_COPY.toggle}
        title={INLINE_LEGEND_COPY.toggle}
        onClick={() => setOpen(!open)}
      >
        <i className="fa-solid fa-circle-question" aria-hidden="true" />
      </button>
      {open && (
        <div id={panel} data-so="inline-legend" role="note" className="so-inline-panel so-inline-legend">
          <ul className="so-inline-list">
            {INLINE_CATEGORIES.map((category) => (
              <li key={category} className="so-inline-line">
                <i className={`${INLINE_ICONS[category]} so-inline-state`} aria-hidden="true" />
                <span className="so-inline-text"><b>{INLINE_CATEGORY_LABELS[category]}</b>: {INLINE_CATEGORY_HELP[category]}</span>
              </li>
            ))}
          </ul>
          <div className="so-inline-text">{INLINE_LEGEND_COPY.levels}:</div>
          <ul className="so-inline-list">
            {levels.map((entry) => (
              <li key={entry} className="so-inline-text"><b>{INLINE_LEVEL_LABELS[entry]}</b>: {INLINE_LEVEL_HELP[entry]}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
};

export default InlineLegend;
