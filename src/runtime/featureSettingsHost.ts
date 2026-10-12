import { currentUserHandle } from "@services/STAPI";
import { deviceSettingsStore } from "./deviceSettings";

const storage = {
  getItem: (key: string) => typeof localStorage === "undefined" ? null : localStorage.getItem(key),
  setItem: (key: string, value: string) => localStorage.setItem(key, value),
};
export const devicePreferences = () => deviceSettingsStore(storage, () => typeof localStorage === "undefined" ? "non-browser" : currentUserHandle());
