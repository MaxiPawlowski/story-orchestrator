import { isRecord } from "@utils/guards";
import { readSettingPath, writeSettingPath } from "./featureResolve";
import type { GlobalSettings } from "./settingsModel";
import { log } from "@utils/log";

export const DEVICE_SETTING_PATHS = [
  "display.hudEnabled", "display.inline.level", "display.inline.window", "display.inline.categories",
  "sprites.stage", "sprites.focus", "sprites.breathing", "sprites.blink", "sprites.mouth", "sprites.liveHead", "sprites.liveHeadFrames",
  "display.yourMove",
] as const;
export type DeviceSettingPath = typeof DEVICE_SETTING_PATHS[number];
export type DeviceSettings = Partial<Record<DeviceSettingPath, unknown>>;

const valid = (path: DeviceSettingPath, value: unknown): boolean => {
  if (path === "display.inline.level") return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 4;
  if (path === "display.inline.window") return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 200;
  if (path === "display.inline.categories") return isRecord(value) && Object.values(value).every((entry) => typeof entry === "boolean");
  if (path === "sprites.stage") return value === "vn" || value === "always" || value === "off";
  if (path === "sprites.mouth") return value === "off" || value === "simple" || value === "smooth";
  return typeof value === "boolean";
};

export const sanitizeDeviceSettings = (raw: unknown): DeviceSettings => !isRecord(raw) ? {} : Object.fromEntries(
  DEVICE_SETTING_PATHS.flatMap((path) => valid(path, raw[path]) ? [[path, raw[path]]] : []),
);

export const deviceSettingsStore = (storage: Pick<Storage, "getItem" | "setItem">, user: () => string) => {
  const key = () => `story-orchestrator.device.${encodeURIComponent(user())}`;
  const read = (): DeviceSettings => {
    try { return sanitizeDeviceSettings(JSON.parse(storage.getItem(key()) ?? "{}")); }
    catch (error) { log.warn("Device preferences could not be read; using install display defaults", error); return {}; }
  };
  return {
    read,
    set(path: DeviceSettingPath, value: unknown) {
      const next = read();
      if (value === undefined) delete next[path];
      else if (valid(path, value)) next[path] = value;
      else throw new Error("Invalid device preference");
      storage.setItem(key(), JSON.stringify(next));
      return next;
    },
  };
};

export const applyDeviceSettings = (global: GlobalSettings, device: DeviceSettings): GlobalSettings => {
  const result = { ...global };
  for (const [path, value] of Object.entries(sanitizeDeviceSettings(device))) writeSettingPath(result, path, value);
  return result;
};

export const deviceSettingValue = (global: GlobalSettings, device: DeviceSettings, path: DeviceSettingPath) => ({
  value: device[path] ?? readSettingPath(global, path), source: device[path] === undefined ? "install" as const : "device" as const,
});
