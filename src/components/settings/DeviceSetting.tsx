import { useState } from "react";
import { devicePreferences } from "@runtime/featureSettingsHost";
import { deviceControlId, type DeviceSettingPath, type DeviceSettings } from "@runtime/deviceSettings";
import { Icon } from "@components/ui/Button";
import { log } from "@utils/log";

export interface DeviceStore {
  read(): DeviceSettings;
  set(path: DeviceSettingPath, value: unknown): DeviceSettings;
}

export interface DeviceSetting<T> {
  path: DeviceSettingPath;
  overridden: boolean;
  write(value: T): void;
  toggle(): void;
  error: string | null;
}

export const DEVICE_SAVE_ERROR = "This browser could not save its device preferences.";

export const useDeviceSetting = <T,>(path: DeviceSettingPath, effective: T, writeInstall: (value: T) => void, notify: () => void,
  store: DeviceStore = devicePreferences()): DeviceSetting<T> => {
  const [device, setDevice] = useState<DeviceSettings>(() => store.read());
  const [error, setError] = useState<string | null>(null);
  const overridden = device[path] !== undefined;
  const save = (value: unknown) => {
    try { setDevice(store.set(path, value)); setError(null); notify(); }
    catch (failure) { log.warn("Device preference save failed", failure); setError(DEVICE_SAVE_ERROR); }
  };
  return {
    path, overridden, error,
    write: (value) => { if (overridden) save(value); else writeInstall(value); },
    toggle: () => save(overridden ? undefined : effective),
  };
};

export const DeviceChip = ({ setting, label }: { setting: Pick<DeviceSetting<unknown>, "path" | "overridden" | "toggle">; label: string }) => (
  <span className="so-chip so-device-chip" data-tone={setting.overridden ? "info" : "neutral"} data-selected={setting.overridden || undefined}>
    <button type="button" id={deviceControlId(setting.path)} data-so="device-chip" className="so-chip-main" aria-pressed={setting.overridden}
      aria-label={setting.overridden ? `${label}: this device uses its own value. Use the value for all devices` : `${label}: use a different value on this device`}
      title={setting.overridden ? "This device uses its own value. Click to follow the value for all devices." : "Use a different value on this device only."}
      onClick={setting.toggle}>
      <Icon name="fa-mobile-screen-button" />This device
    </button>
  </span>
);
