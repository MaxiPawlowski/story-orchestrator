import type { CapabilityState } from "@services/STAPI";
import { PLAYER_COPY } from "@runtime/narrative";
import type { SpriteActivation, SpriteSettings, StageMode } from "./settings";

export interface SpriteSettingsViewProps {
  settings: SpriteSettings;
  activation: SpriteActivation;
  waitsForVn: boolean;
  capability: CapabilityState | "checking";
  profiles: ReadonlyArray<{ id: string; name: string }>;
  onStage: string;
  onChange(patch: Partial<SpriteSettings>): void;
  onSwitch(enabled: boolean): void;
  onStoryDecides(): void;
}

const ACTIVATION_TEXT: Record<SpriteActivation, string> = {
  "user-on": "On in every chat: you switched it on.",
  "user-off": "Off in every chat: you switched it off, so a story that directs a stage does not turn it on.",
  story: "On for this chat: its story directs a stage. Switch it off to keep sprites off everywhere.",
  off: "Off: this chat's story directs no stage. If a newer version of the story adds one, take it with Update or Restart in the Story Orchestrator drawer.",
};

export function SpriteSettingsView({ settings, activation, waitsForVn, capability, profiles, onStage, onChange, onSwitch, onStoryDecides }: SpriteSettingsViewProps) {
  const on = (activation === "user-on" || activation === "story") && settings.stage !== "off";
  const stage = settings.stage === "off" ? "vn" : settings.stage;
  const toggle = (next: boolean) => {
    if (next && settings.stage === "off") onChange({ stage: "vn" });
    onSwitch(next);
  };
  return (
    <div id="so-sprite-settings" className="flex flex-col gap-2 border-t border-solid border-white/10 pt-2">
      <div className="text-sm font-bold">Sprite stage</div>
      <label className="flex items-center gap-2 text-sm">
        <input id="so-sprite-enabled" type="checkbox" checked={on} disabled={capability === "absent"} onChange={(event) => toggle(event.target.checked)} />
        <span>Show character sprites that change expression as replies stream</span>
      </label>
      <div id="so-sprite-activation" data-activation={activation} className="flex flex-wrap items-center gap-2 text-xs opacity-80">
        <span>{ACTIVATION_TEXT[activation]}</span>
        {settings.explicit && <button id="so-sprite-story-decides" type="button" className="menu_button text-xs" onClick={onStoryDecides}>Let each story decide</button>}
      </div>
      {on && waitsForVn && <div id="so-sprite-vn-hint" className="text-xs so-warning-text">{PLAYER_COPY.spriteNeedsVn}</div>}
      {capability === "absent" && <div id="so-sprite-capability" className="text-xs so-warning-text">{PLAYER_COPY.spriteUnavailable}</div>}
      <label htmlFor="so-sprite-stage" className="text-sm">Show the stage</label>
      <select id="so-sprite-stage" value={stage} disabled={!on} onChange={(event) => onChange({ stage: event.target.value as StageMode })}>
        <option value="vn">With Visual Novel mode (/vn)</option>
        <option value="always">Always</option>
      </select>
      <label className="flex flex-col gap-1 text-sm">
        <span>Expression model when the judge is off or unavailable</span>
        <select id="so-sprite-profile" value={settings.profileId} onChange={(event) => onChange({ profileId: event.target.value })}>
          <option value="">Same as the image director</option>
          {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input id="so-sprite-focus" type="checkbox" checked={settings.focus} onChange={(event) => onChange({ focus: event.target.checked })} />
        <span>Dim whoever is not speaking</span>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input id="so-sprite-breathing" type="checkbox" checked={settings.breathing} onChange={(event) => onChange({ breathing: event.target.checked })} />
        <span>Idle breathing</span>
      </label>
      <div id="so-sprite-cast" className="text-xs opacity-70">{onStage || PLAYER_COPY.spriteNoPack}</div>
    </div>
  );
}

export default SpriteSettingsView;
