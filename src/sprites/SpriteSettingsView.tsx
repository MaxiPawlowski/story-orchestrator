import type { CapabilityState } from "@services/STAPI";
import type { SpriteActivation, SpriteSettings, StageMode } from "./settings";

export interface SpriteSettingsViewProps {
  settings: SpriteSettings;
  activation: SpriteActivation;
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
  off: "Off: this chat's story directs no stage. A story that does turns sprites on for its chats.",
};

export function SpriteSettingsView({ settings, activation, capability, profiles, onStage, onChange, onSwitch, onStoryDecides }: SpriteSettingsViewProps) {
  const on = activation === "user-on" || activation === "story";
  return (
    <div id="so-sprite-settings" className="flex flex-col gap-2 border-t border-solid border-white/10 pt-2">
      <div className="text-sm font-bold">Sprite stage</div>
      <label className="flex items-center gap-2 text-sm">
        <input id="so-sprite-enabled" type="checkbox" checked={on} disabled={capability === "absent"} onChange={(event) => onSwitch(event.target.checked)} />
        <span>Show character sprites that change expression as replies stream</span>
      </label>
      <div id="so-sprite-activation" data-activation={activation} className="flex flex-wrap items-center gap-2 text-xs opacity-80">
        <span>{ACTIVATION_TEXT[activation]}</span>
        {settings.explicit && <button id="so-sprite-story-decides" type="button" className="menu_button text-xs" onClick={onStoryDecides}>Let each story decide</button>}
      </div>
      {capability === "absent" && <div id="so-sprite-capability" className="text-xs text-yellow-300">This SillyTavern has no sprite route (/api/sprites), so no sprite can show.</div>}
      <label className="flex flex-col gap-1 text-sm">
        <span>Stage</span>
        <select id="so-sprite-stage" value={settings.stage} onChange={(event) => onChange({ stage: event.target.value as StageMode })}>
          <option value="vn">With Visual Novel mode (/vn)</option>
          <option value="always">Always</option>
          <option value="off">Off</option>
        </select>
      </label>
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
      <div id="so-sprite-cast" className="text-xs opacity-70">{onStage || "No one in this chat has a sprite pack."}</div>
    </div>
  );
}

export default SpriteSettingsView;
