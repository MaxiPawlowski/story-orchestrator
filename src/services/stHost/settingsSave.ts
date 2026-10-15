import { wrote, type WriteResult } from "@utils/writeResult";
import { getContext } from "./context";
import { scriptModule } from "./modules";

let queued: ReturnType<typeof setTimeout> | null = null;

export function saveSettingsSoon(): WriteResult<{ queued: boolean }> {
  if (queued !== null) return wrote({ queued: false });
  queued = setTimeout(() => {
    queued = null;
    const save = scriptModule.saveSettings;
    if (typeof save === "function") void save();
    else getContext().saveSettingsDebounced();
  }, 0);
  return wrote({ queued: true });
}
