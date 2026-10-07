import { defaultPresenceSettings, PRESENCE_SETTING_KEYS, type PresenceSettings } from "@runtime/displayToggles";
import type { RuntimeSnapshot } from "@runtime/types";
import { PRESENCE_STORY_HINT } from "@features/presenceCopy";
import { CheckRow } from "./Field";

export interface PresenceControlsProps {
  snapshot: RuntimeSnapshot;
  onChange: (presence: PresenceSettings) => void;
}

const ID: Record<keyof PresenceSettings, string> = {
  listBadges: "so-presence-list-badges",
  continueList: "so-presence-continue-list",
  groupCard: "so-presence-group-card",
  chapterCard: "so-presence-chapter-card",
  wand: "so-presence-wand",
  rollChips: "so-presence-roll-chips",
  suggestions: "so-presence-suggestions",
  journal: "so-presence-journal",
  statSheet: "so-presence-stat-sheet",
  widgets: "so-presence-widgets",
};

export const PresenceControls = ({ snapshot, onChange }: PresenceControlsProps) => {
  const presence = snapshot.ui.presence ?? defaultPresenceSettings();
  const keys = PRESENCE_SETTING_KEYS;
  return (
    <div data-so="presence-controls" className="flex flex-col gap-1">
      {keys.map((key) => (
        <CheckRow
          key={key}
          id={ID[key]}
          setting={`display.presence.${key}`}
          checked={presence[key]}
          onChange={(on) => onChange({ ...presence, [key]: on })}
        />
      ))}
      <div className="text-xs opacity-70">{PRESENCE_STORY_HINT}</div>
    </div>
  );
};

export default PresenceControls;
