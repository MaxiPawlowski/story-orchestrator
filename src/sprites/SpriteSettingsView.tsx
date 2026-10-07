import type { CapabilityState } from "@services/STAPI";
import { PLAYER_COPY } from "@runtime/narrative";
import type { SpriteActivation, SpriteSettings, StageMode } from "./settings";
import { Advanced, CheckRow, FieldLabel } from "@components/settings/Field";

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
  onRemoveStorySprites?: () => void;
  removeNotice?: string | null;
}

const ACTIVATION_TEXT: Record<SpriteActivation, string> = {
  "user-on": "On in every chat: you switched it on.",
  "user-off": "Off in every chat: you switched it off, so a story that directs a stage does not turn it on.",
  story: "On for this chat: its story directs a stage. Switch it off to keep sprites off everywhere.",
  off: "Off: this chat's story directs no stage. If a newer version of the story adds one, take it with Update or Restart in the Story Orchestrator drawer.",
};

export function SpriteSettingsView({
  settings, activation, waitsForVn, capability, profiles, onStage, onChange, onSwitch, onStoryDecides, onRemoveStorySprites, removeNotice,
}: SpriteSettingsViewProps) {
  const on = (activation === "user-on" || activation === "story") && settings.stage !== "off";
  const stage = settings.stage === "off" ? "vn" : settings.stage;
  const toggle = (next: boolean) => {
    if (next && settings.stage === "off") onChange({ stage: "vn" });
    onSwitch(next);
  };
  return (
    <div id="so-sprite-settings" className="flex flex-col gap-2 border-t border-solid border-white/10 pt-2">
      <div className="text-sm font-bold">Sprite stage</div>
      <CheckRow id="so-sprite-enabled" setting="sprites.enabled" checked={on} disabled={capability === "absent"} onChange={toggle} />
      <div id="so-sprite-activation" data-activation={activation} className="flex flex-wrap items-center gap-2 text-xs opacity-80">
        <span>{ACTIVATION_TEXT[activation]}</span>
        {settings.explicit && <button id="so-sprite-story-decides" type="button" className="menu_button text-xs" onClick={onStoryDecides}>Let each story decide</button>}
      </div>
      {on && waitsForVn && <div id="so-sprite-vn-hint" className="text-xs so-warning-text">{PLAYER_COPY.spriteNeedsVn}</div>}
      {capability === "absent" && <div id="so-sprite-capability" className="text-xs so-warning-text">{PLAYER_COPY.spriteUnavailable}</div>}
      <FieldLabel htmlFor="so-sprite-stage" setting="sprites.stage" />
      <select id="so-sprite-stage" value={stage} disabled={!on} onChange={(event) => onChange({ stage: event.target.value as StageMode })}>
        <option value="vn">With Visual Novel mode (/vn)</option>
        <option value="always">Always</option>
      </select>
      <Advanced id="so-sprite-advanced">
        <FieldLabel htmlFor="so-sprite-profile" setting="sprites.profileId" />
        <select id="so-sprite-profile" value={settings.profileId} onChange={(event) => onChange({ profileId: event.target.value })}>
          <option value="">Same as the image-prompt model</option>
          {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
        </select>
        <CheckRow id="so-sprite-focus" setting="sprites.focus" checked={settings.focus} onChange={(focus) => onChange({ focus })} />
        <CheckRow id="so-sprite-breathing" setting="sprites.breathing" checked={settings.breathing} onChange={(breathing) => onChange({ breathing })} />
        <CheckRow id="so-sprite-blink" setting="sprites.blink" checked={settings.blink} onChange={(blink) => onChange({ blink })} />
        <CheckRow id="so-sprite-on-demand" setting="sprites.onDemand" checked={settings.onDemand} onChange={(onDemand) => onChange({ onDemand })} />
        <FieldLabel htmlFor="so-sprite-mouth" setting="sprites.mouth" />
        <select id="so-sprite-mouth" value={settings.mouth} onChange={(event) => onChange({ mouth: event.target.value as typeof settings.mouth })}>
          <option value="off">Off</option><option value="simple">Simple</option><option value="smooth">Smooth (falls back to simple)</option>
        </select>
        {onRemoveStorySprites && <div className="flex flex-col gap-1">
          <button id="so-sprite-remove-story" type="button" className="menu_button text-xs" onClick={onRemoveStorySprites}>Remove generated sprites for this story</button>
          {removeNotice && <span id="so-sprite-remove-notice" role="status" className="text-xs opacity-70">{removeNotice}</span>}
        </div>}
      </Advanced>
      <div id="so-sprite-cast" className="text-xs opacity-70">{onStage || PLAYER_COPY.spriteNoPack}</div>
    </div>
  );
}

export default SpriteSettingsView;
