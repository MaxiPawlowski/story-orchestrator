import { getContext } from "./context";

// `/version` is the server's own answer (`src/server-main.js:272` → `getVersion()` in
// `src/util.js:136`), and it is the only place a client can learn which SillyTavern it is running on:
// the package version and the git revision the server is on. Cached per page load — it cannot change
// while the page lives, and a bug report needs it exactly once.

export interface HostVersion {
  version: string;
  commit: string | null;
  branch: string | null;
}

let cached: HostVersion | null | undefined;

export async function getHostVersion(): Promise<HostVersion | null> {
  if (cached !== undefined) return cached;
  try {
    const response = await fetch("/version");
    if (!response.ok) return (cached = null);
    const data = await response.json() as { pkgVersion?: unknown; gitRevision?: unknown; gitBranch?: unknown };
    cached = typeof data.pkgVersion === "string"
      ? {
        version: data.pkgVersion,
        commit: typeof data.gitRevision === "string" ? data.gitRevision : null,
        branch: typeof data.gitBranch === "string" ? data.gitBranch : null,
      }
      : null;
  } catch {
    cached = null;
  }
  return cached;
}

/** Which macro engine registered our `{{story_*}}` macros — see the macros bullet in gotchas. */
export const macroEngineInUse = (): "new" | "legacy" | "unknown" => {
  try {
    const settings = (getContext() as unknown as { powerUserSettings?: { experimental_macro_engine?: unknown } }).powerUserSettings;
    if (!settings) return "unknown";
    return settings.experimental_macro_engine === true ? "new" : "legacy";
  } catch {
    return "unknown";
  }
};
