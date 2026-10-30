import { useEffect, useState } from "react";
import { spriteOnStageText } from "@runtime/narrative";
import type { SpriteStage } from "./stage";
import { listConnectionProfiles } from "@services/STAPI";
import type { RuntimeManager } from "@runtime/runtimeManager";
import type { DeviceSettingPath } from "@runtime/deviceSettings";
import { devicePreferences } from "@runtime/featureSettingsHost";
import { DeviceChip, useDeviceSetting, type DeviceSetting } from "@components/settings/DeviceSetting";
import { storySpriteChoice, userSpriteChoice } from "./activation";
import { startSprites } from "./start";
import { SpriteSettingsView, type SpriteDeviceKey } from "./SpriteSettingsView";
import type { SpriteSettings } from "./settings";
import { LiveHeadAuthor } from "./liveHead/LiveHeadAuthor";
import { liveHeadKey } from "./liveHeadRefs";

const DEVICE_LABELS: Record<SpriteDeviceKey, string> = {
  stage: "Show stage", focus: "Dim non-speakers", breathing: "Breathing", blink: "Blinking", mouth: "Mouth movement",
  liveHead: "Live close-shot head", liveHeadFrames: "Drawn eyes and mouth on the live head",
};

const useSpriteDevice = (stage: SpriteStage | null, manager: RuntimeManager): Record<SpriteDeviceKey, DeviceSetting<unknown>> => {
  const settings = stage?.view().settings;
  const [store] = useState(devicePreferences);
  const write = (key: SpriteDeviceKey) => (value: unknown) => stage?.updateSettings({ [key]: value } as Partial<SpriteSettings>);
  const useKey = (key: SpriteDeviceKey) => useDeviceSetting<unknown>(`sprites.${key}` as DeviceSettingPath, settings?.[key], write(key), () => manager.notify(), store);
  return {
    stage: useKey("stage"), focus: useKey("focus"), breathing: useKey("breathing"), blink: useKey("blink"), mouth: useKey("mouth"),
    liveHead: useKey("liveHead"), liveHeadFrames: useKey("liveHeadFrames"),
  };
};

export default function SpriteGroup({ manager }: { manager: RuntimeManager }) {
  const [stage, setStage] = useState<SpriteStage | null>(null);
  const [, refresh] = useState(0);
  useEffect(() => { setStage(startSprites(manager)); }, [manager]);
  useEffect(() => (stage ? stage.subscribe(() => refresh((count) => count + 1)) : undefined), [stage]);
  const device = useSpriteDevice(stage, manager);
  if (!stage) return null;
  const view = stage.view();
  const snapshot = manager.getSnapshot();
  const change = (patch: Partial<SpriteSettings>) => {
    const rest: Partial<SpriteSettings> = {};
    for (const [key, value] of Object.entries(patch) as Array<[keyof SpriteSettings, unknown]>) {
      const setting = key in device ? device[key as SpriteDeviceKey] : null;
      if (setting?.overridden) setting.write(value);
      else Object.assign(rest, { [key]: value });
    }
    if (Object.keys(rest).length) stage.updateSettings(rest);
  };
  const error = Object.values(device).find((setting) => setting.error)?.error;
  return (
    <>
    <SpriteSettingsView
      settings={view.settings}
      activation={view.activation}
      waitsForVn={view.waitsForVn}
      capability={view.capability}
      profiles={listConnectionProfiles()}
      onStage={view.actors.length ? spriteOnStageText(view.actors.map((actor) => actor.name)) : ""}
      onChange={change}
      onSwitch={(enabled) => stage.updateSettings(userSpriteChoice(enabled))}
      onStoryDecides={() => stage.updateSettings(storySpriteChoice())}
      deviceChip={(key) => <DeviceChip setting={device[key]} label={DEVICE_LABELS[key]} />}
      deviceScope={(key) => device[key].overridden ? "device" : undefined}
    />
    {error && <p role="alert" className="so-warning-text">{error}</p>}
    {snapshot.ui.authorView && <LiveHeadAuthor rows={stage.headStatus()} onImport={(ref) => {
      const rigs = Object.fromEntries(Object.entries(view.settings.liveHeadRigs).filter(([, entry]) => entry.member !== ref.member || entry.look !== ref.look));
      stage.updateSettings({ liveHeadRigs: { ...rigs, [liveHeadKey(ref)]: ref } });
    }} />}
    </>
  );
}
