import type { ReactNode } from "react";
import type { CapabilityState } from "@services/STAPI";
import { PLAYER_COPY } from "@runtime/narrative";
import type { SettingScope } from "@components/ui/SettingRow";
import { SettingRow } from "@components/ui/SettingRow";
import { Section } from "@components/ui/Section";
import { Select } from "@components/ui/Field";
import { SegmentedControl } from "@components/ui/SegmentedControl";
import { Button } from "@components/ui/Button";
import { settingCopy } from "@features/settingsCopy";
import type { EffectsLevel, SpriteActivation, SpriteSettings, StageMode } from "./settings";
import { CheckRow, HelpText } from "@components/settings/Field";

export type SpriteDeviceKey = "stage" | "effects" | "focus" | "breathing" | "blink" | "mouth" | "liveHead" | "liveHeadFrames";

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
  deviceChip?: (key: SpriteDeviceKey) => ReactNode;
  deviceScope?: (key: SpriteDeviceKey) => SettingScope | undefined;
}

const ACTIVATION_TEXT: Record<SpriteActivation, string> = {
  "user-on": "On in every chat: you switched it on.",
  "user-off": "Off in every chat: you switched it off, so a story that directs a stage does not turn it on.",
  story: "On for this chat: its story directs a stage. Switch it off to keep sprites off everywhere.",
  off: "Off: this chat's story directs no stage. If an edited copy of the story adds one, take it with Update to the latest or Restart in the Story Orchestrator drawer.",
};

const ANIMATION_COPY = { focus: "sprites.focus", breathing: "sprites.breathing", blink: "sprites.blink", liveHead: "sprites.liveHead", liveHeadFrames: "sprites.liveHeadFrames" } as const;

const MOUTHS = [{ value: "off", label: "Off" }, { value: "simple", label: "Simple" }, { value: "smooth", label: "Smooth", title: "Half-open frames; falls back to simple" }] as const;
const STAGES = [{ value: "vn", label: "With Visual Novel mode (/vn)" }, { value: "always", label: "Always" }] as const;
const EFFECTS: ReadonlyArray<{ value: EffectsLevel; label: string }> = [{ value: "full", label: "Full" }, { value: "calm", label: "Calm" }, { value: "off", label: "Off" }];

export function SpriteSettingsView({
  settings, activation, waitsForVn, capability, profiles, onStage, onChange, onSwitch, onStoryDecides, deviceChip, deviceScope,
}: SpriteSettingsViewProps) {
  const on = (activation === "user-on" || activation === "story") && settings.stage !== "off";
  const stage = settings.stage === "off" ? "vn" : settings.stage;
  const toggle = (next: boolean) => {
    if (next && settings.stage === "off") onChange({ stage: "vn" });
    onSwitch(next);
  };
  const animation = (key: Exclude<SpriteDeviceKey, "stage" | "mouth" | "effects">, id: string) => (
    <CheckRow id={id} setting={ANIMATION_COPY[key]} checked={settings[key]} scope={deviceScope?.(key)} extra={deviceChip?.(key)}
      onChange={(value) => onChange({ [key]: value })} />
  );
  return (
    <div id="so-sprite-settings" className="so-setting-group">
      <Section title="Sprite stage" level={3}>
        <p id="so-sprite-cast" className="so-setting-desc">{onStage || PLAYER_COPY.spriteNoPack}</p>
        <CheckRow id="so-sprite-enabled" setting="sprites.enabled" checked={on} disabled={capability === "absent"} onChange={toggle}
          description={<span id="so-sprite-activation" data-activation={activation}>{ACTIVATION_TEXT[activation]}</span>}
          extra={settings.explicit ? <Button id="so-sprite-story-decides" variant="ghost" size="sm" onClick={onStoryDecides}>Let each story decide</Button> : undefined} />
        {on && waitsForVn && <div id="so-sprite-vn-hint" className="so-warning-text">{PLAYER_COPY.spriteNeedsVn}</div>}
        {capability === "absent" && <div id="so-sprite-capability" className="so-warning-text">{PLAYER_COPY.spriteUnavailable}</div>}
        <SettingRow label={settingCopy("sprites.stage").label} description={<HelpText text={settingCopy("sprites.stage").help} />} scope={deviceScope?.("stage")}
          control={<>{deviceChip?.("stage")}<SegmentedControl id="so-sprite-stage" label={settingCopy("sprites.stage").label} size="sm" value={stage} disabled={!on}
            options={STAGES} onChange={(value: StageMode) => onChange({ stage: value })} /></>} />
        <SettingRow data-so="sprite-effects" label={settingCopy("sprites.effects").label} description={<HelpText text={settingCopy("sprites.effects").help} />}
          scope={deviceScope?.("effects")} control={<>{deviceChip?.("effects")}<SegmentedControl id="so-sprite-effects" label={settingCopy("sprites.effects").label} size="sm"
            value={settings.effects} options={EFFECTS} onChange={(effects: EffectsLevel) => onChange({ effects })} /></>} />
        <CheckRow id="so-sprite-poses" setting="sprites.poses" checked={settings.poses} onChange={(poses) => onChange({ poses })} />
        <CheckRow id="so-sprite-on-demand" setting="sprites.onDemand" checked={settings.onDemand} onChange={(onDemand) => onChange({ onDemand })} />
        <SettingRow label={settingCopy("sprites.profileId").label} htmlFor="so-sprite-profile" description={<HelpText text={settingCopy("sprites.profileId").help} />}
          control={<Select id="so-sprite-profile" size="lg" value={settings.profileId} onChange={(event) => onChange({ profileId: event.target.value })}>
            <option value="">Same as the image-prompt model</option>
            {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
          </Select>} />
      </Section>
      <Section id="so-sprite-animation" title="Stage animation" level={3} description="How the characters on stage move. Each row can differ on this device.">
        {animation("focus", "so-sprite-focus")}
        {animation("breathing", "so-sprite-breathing")}
        {animation("blink", "so-sprite-blink")}
        <SettingRow label={settingCopy("sprites.mouth").label} description={<HelpText text={settingCopy("sprites.mouth").help} />} scope={deviceScope?.("mouth")}
          control={<>{deviceChip?.("mouth")}<SegmentedControl id="so-sprite-mouth" label={settingCopy("sprites.mouth").label} size="sm" value={settings.mouth}
            options={MOUTHS} onChange={(mouth: SpriteSettings["mouth"]) => onChange({ mouth })} /></>} />
        {animation("liveHead", "so-live-head-enabled")}
        {animation("liveHeadFrames", "so-live-head-frames")}
      </Section>
    </div>
  );
}

export default SpriteSettingsView;
