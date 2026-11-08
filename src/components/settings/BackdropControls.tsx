import { useState } from "react";
import type { BackdropSettings } from "@backdrop/types";
import { BACKDROP_SWITCHES, sanitizeBackdropSettings } from "@backdrop/settings";
import type { DeviceSettingPath, DeviceSettings } from "@runtime/deviceSettings";
import { getGlobalSettings, setGlobalSettings } from "@runtime/settingsStore";
import { settingCopy } from "@features/settingsCopy";
import { SettingRow } from "@components/ui/SettingRow";
import { SegmentedControl } from "@components/ui/SegmentedControl";
import { StatusText } from "@components/ui/StatusText";
import { CheckRow, HelpText } from "./Field";
import { DeviceChip, useDeviceSetting, type DeviceSetting, type DeviceStore } from "./DeviceSetting";

type BackdropSwitch = (typeof BACKDROP_SWITCHES)[number];

const SWITCH_IDS: Record<BackdropSwitch, string> = {
  enabled: "so-backdrop-enabled", effects: "so-backdrop-effects", parallax: "so-backdrop-parallax", loops: "so-backdrop-loops", dimBehindChat: "so-backdrop-dim",
};
const SWITCH_LABELS: Record<BackdropSwitch, string> = {
  enabled: "Animated backdrop", effects: "Backdrop effects", parallax: "Backdrop depth", loops: "Backdrop loops", dimBehindChat: "Dim behind the chat",
};
export const BACKDROP_INTENSITY_LEVELS = [
  { value: "0.25", label: "Calm" }, { value: "0.5", label: "Low" }, { value: "0.75", label: "Medium" }, { value: "1", label: "Full" },
] as const;

export const nearestIntensity = (value: number): string => BACKDROP_INTENSITY_LEVELS.reduce((best, level) =>
  Math.abs(Number(level.value) - value) < Math.abs(Number(best.value) - value) ? level : best, BACKDROP_INTENSITY_LEVELS[0]).value;

export const backdropEffective = (install: BackdropSettings, device: DeviceSettings): BackdropSettings => sanitizeBackdropSettings(Object.fromEntries(
  Object.entries(install).map(([key, value]) => [key, device[`display.backdrop.${key}` as DeviceSettingPath] ?? value])));

export interface BackdropControlsProps {
  deviceStore: DeviceStore;
  notify(): void;
  readInstall?: () => BackdropSettings;
  writeInstall?: (patch: Partial<BackdropSettings>) => void;
}

const defaultRead = (): BackdropSettings => getGlobalSettings().display.backdrop;
const defaultWrite = (patch: Partial<BackdropSettings>) => { setGlobalSettings({ display: { backdrop: { ...defaultRead(), ...patch } } }); };

export const BackdropControls = ({ deviceStore, notify, readInstall = defaultRead, writeInstall = defaultWrite }: BackdropControlsProps) => {
  const [, refresh] = useState(0);
  const effective = backdropEffective(readInstall(), deviceStore.read());
  const changed = () => { refresh((count) => count + 1); notify(); };
  const install = (key: keyof BackdropSettings) => (value: unknown) => { writeInstall({ [key]: value }); changed(); };
  const use = <T,>(key: keyof BackdropSettings) => [`display.backdrop.${key}` as DeviceSettingPath, effective[key] as T, install(key), changed, deviceStore] as const;
  const switches: Record<BackdropSwitch, DeviceSetting<boolean>> = {
    enabled: useDeviceSetting<boolean>(...use<boolean>("enabled")), effects: useDeviceSetting<boolean>(...use<boolean>("effects")),
    parallax: useDeviceSetting<boolean>(...use<boolean>("parallax")), loops: useDeviceSetting<boolean>(...use<boolean>("loops")),
    dimBehindChat: useDeviceSetting<boolean>(...use<boolean>("dimBehindChat")),
  };
  const intensity = useDeviceSetting<number>(...use<number>("intensity"));
  const error = [...Object.values(switches), intensity].find((setting) => setting.error)?.error;
  const row = (key: BackdropSwitch, disabled = false) => (
    <CheckRow key={key} id={SWITCH_IDS[key]} setting={`display.backdrop.${key}`} checked={effective[key]} disabled={disabled}
      scope={switches[key].overridden ? "device" : undefined} extra={<DeviceChip setting={switches[key]} label={SWITCH_LABELS[key]} />}
      onChange={(on) => switches[key].write(on)} />
  );
  const off = !effective.enabled;
  return (
    <div id="so-backdrop-settings" className="so-setting-group">
      {row("enabled")}
      {row("effects", off)}
      {row("parallax", off)}
      {row("loops", off)}
      <SettingRow label={settingCopy("display.backdrop.intensity").label} description={<HelpText text={settingCopy("display.backdrop.intensity").help} />}
        scope={intensity.overridden ? "device" : undefined}
        control={<>
          <DeviceChip setting={intensity} label="Backdrop strength" />
          <SegmentedControl id="so-backdrop-intensity" label="Backdrop strength" size="sm" disabled={off} value={nearestIntensity(effective.intensity)}
            options={BACKDROP_INTENSITY_LEVELS} onChange={(next) => intensity.write(Number(next))} />
        </>} />
      {row("dimBehindChat", off)}
      {error && <StatusText tone="warn" role="alert">{error}</StatusText>}
    </div>
  );
};

export default BackdropControls;
