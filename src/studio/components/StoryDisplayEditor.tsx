import React from "react";
import type { StoryDisplay } from "@engine/index";
import HelpTooltip from "@components/studio/HelpTooltip";
import { PRESENCE_TOGGLES, STORY_TOGGLE_KEYS, type PresenceToggle } from "@runtime/displayToggles";
import { settingCopy } from "@features/settingsCopy";
import { PRESENCE_STORY_HINT } from "@features/presenceCopy";
import { useDraftStore } from "../draft";
import { setStoryField } from "../mutations";

const withToggle = (display: StoryDisplay | undefined, toggle: PresenceToggle, on: boolean): StoryDisplay | undefined => {
  const key = STORY_TOGGLE_KEYS[toggle];
  const { [key]: _old, ...rest } = display ?? {};
  const next: StoryDisplay = on ? rest : { ...rest, [key]: false };
  return Object.keys(next).length ? next : undefined;
};

const StoryDisplayEditor: React.FC = () => {
  const display = useDraftStore((state) => state.draft.display);
  const mutate = useDraftStore((state) => state.mutate);
  return (
    <div data-so="story-display" className="st-subpanel flex flex-col gap-2 p-3">
      <div className="text-sm font-medium">Story presence <span className="st-muted font-normal">— what this story shows around the chat</span><HelpTooltip title={PRESENCE_STORY_HINT} /></div>
      {PRESENCE_TOGGLES.map((toggle) => {
        const copy = settingCopy(`display.presence.${toggle}`);
        return (
          <label key={toggle} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              data-so="story-display-toggle"
              data-toggle={STORY_TOGGLE_KEYS[toggle]}
              checked={display?.[STORY_TOGGLE_KEYS[toggle]] !== false}
              onChange={(event) => mutate((current) => setStoryField(current, "display", withToggle(current.display, toggle, event.target.checked)))}
            />
            <span>{copy.label}</span>
            <HelpTooltip title={copy.help} />
          </label>
        );
      })}
    </div>
  );
};

export default StoryDisplayEditor;
