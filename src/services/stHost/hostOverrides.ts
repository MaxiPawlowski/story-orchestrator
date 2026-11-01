import { log } from "@utils/log";
import type { WriteResult } from "@utils/writeResult";
import { installGroupRegenerate } from "./groupRegenerate";
import { installWorldInfoSaveGuard } from "./worldInfoSaveGuard";

export interface HostOverrideSwitches {
  editorMerge(): boolean;
  regenerateOwnRows(): boolean;
}

const kept = (installed: WriteResult<{ uninstall: () => void }>, what: string): Array<() => void> => {
  if (installed.ok) return [installed.uninstall];
  log.warn(`${what} is not installed`, installed.reason);
  return [];
};

export function installHostOverrides(switches: HostOverrideSwitches): Array<() => void> {
  return [
    ...kept(installWorldInfoSaveGuard(() => switches.editorMerge()), "the lorebook save guard"),
    ...kept(installGroupRegenerate(() => switches.regenerateOwnRows()), "the group Regenerate fix"),
  ];
}
