import { isRecord } from "@utils/guards";
import type { ExtensionConflictHost } from "./extensionConflicts";

export interface TunnelVisionBook {
  name: string;
  suppressesScan: boolean;
  canWrite: boolean;
}

const FOLDERS = ["third-party/TunnelVision", "third-party/tunnelvision-fully-autonomous-and-easy-lorebook"];

export function tunnelVisionBooksWith(host: ExtensionConflictHost): TunnelVisionBook[] {
  if (!isRecord(host.settings) || !isRecord(host.settings.tunnelvision)) return [];
  const root = host.settings;
  const settings = root.tunnelvision as Record<string, unknown>;
  if (settings.globalEnabled === false || !isRecord(settings.enabledLorebooks)) return [];
  const disabled = new Set((Array.isArray(root.disabledExtensions) ? root.disabledExtensions : [])
    .filter((name): name is string => typeof name === "string").map((name) => name.toLowerCase()));
  if (!FOLDERS.some((folder) => !disabled.has(folder.toLowerCase()) && Boolean(host.manifest?.(folder)))) return [];
  const modes = isRecord(settings.bookInjectionModes) ? settings.bookInjectionModes : {};
  const permissions = isRecord(settings.bookPermissions) ? settings.bookPermissions : {};
  const backgroundWrites = Boolean(settings.lifecycleEnabled || settings.postTurnEnabled || settings.sidecarPostGenWriter);
  return Object.entries(settings.enabledLorebooks).filter(([, enabled]) => enabled === true).map(([name]) => ({
    name,
    suppressesScan: !settings.allowKeywordTriggers && modes[name] !== "native",
    canWrite: permissions[name] !== "read_only" || backgroundWrites,
  })).filter((book) => book.suppressesScan || book.canWrite);
}
