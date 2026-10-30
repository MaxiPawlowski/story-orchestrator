import { isRecord } from "@utils/guards";
import type { ExtensionConflictHost } from "./extensionConflicts";

// TavernOS HUD (github.com/alewwi/HUD 2bf687e, manifest 23.88.5): ST clones it to third-party/HUD (repo basename,
// src/endpoints/extensions.js:122). index.js sets window.__tavernOSFetchPatched and replaces window.fetch once; the wrapper
// rewrites every text-generation POST body, other extensions' too (history HUD blocks swapped for summaries), and adds its
// own system message to its own generations. No setting removes the wrapper, so loaded = on.
export const TAVERNOS_FOLDERS = ["third-party/HUD", "third-party/TavernOS", "third-party/tavernos-hud"] as const;
export const TAVERNOS_FETCH_MARKER = "__tavernOSFetchPatched";
const TAVERNOS_INTERCEPTOR = "tavernOSGenerateInterceptor";

export interface TavernOsHost extends Pick<ExtensionConflictHost, "settings" | "manifest"> {
  marker?: unknown;
}

const isTavernOs = (manifest: unknown): boolean => isRecord(manifest)
  && (manifest.generate_interceptor === TAVERNOS_INTERCEPTOR || (typeof manifest.display_name === "string" && /tavernos/i.test(manifest.display_name)));

export function tavernOsOnWith(host: TavernOsHost): boolean {
  if (host.marker === true) return true;
  if (!isRecord(host.settings) || typeof host.manifest !== "function") return false;
  const disabled = new Set((Array.isArray(host.settings.disabledExtensions) ? host.settings.disabledExtensions : [])
    .filter((name): name is string => typeof name === "string").map((name) => name.toLowerCase()));
  return TAVERNOS_FOLDERS.some((folder) => !disabled.has(folder.toLowerCase()) && isTavernOs(host.manifest?.(folder)));
}
