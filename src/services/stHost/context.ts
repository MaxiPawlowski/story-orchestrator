import type { SillyTavernContext } from "./hostTypes";
import { importSTModule } from "./modules";
import { argMacroSeam, type HostArgMacro } from "./macroEngine";

export type StoryOrchestratorHostContext = SillyTavernContext;

type HostMacroValue = string | ((nonce: string) => string);
type MacrosHost = { MacrosParser: { registerMacro: (key: string, value: HostMacroValue, description?: string) => void; unregisterMacro: (key: string) => void } };

type HostYamlDocument = { errors: unknown[]; toJS: () => unknown };
const hostGlobal = globalThis as { SillyTavern?: { getContext?: () => unknown; libs?: { yaml?: { parseDocument?: (text: string) => HostYamlDocument } } } };
const macrosHost = await importSTModule<MacrosHost>("/scripts/macros.js");

// `globalThis.SillyTavern` exists on every supported host (script.js:292, ST 1.18.0).
export const getContext = (): StoryOrchestratorHostContext => hostGlobal.SillyTavern?.getContext?.() as StoryOrchestratorHostContext;

// ST's bundled `yaml` (lib.js:105, exposed as `SillyTavern.libs`, script.js:293) — the parser the server's
// `mergeObjectWithYaml` also uses (src/util.js:844).
export const parseHostYaml = (text: string): unknown => {
  const document = hostGlobal.SillyTavern?.libs?.yaml?.parseDocument?.(text);
  return document && !document.errors.length ? document.toJS() : undefined;
};

/**
 * `extension_settings` is not ours to read until ST has loaded it: before
 * `EXTENSION_SETTINGS_LOADED` (`script.js:8025` — the event name is `extension_settings_loaded`,
 * `events.js:28`) the object holds only whatever the page started with, so a settings read takes
 * those for real values — and a read that writes its sanitized result back would STAMP them over the
 * author's settings. `settingsReady` is the one gate every reader waits on.
 *
 * A page that already fired it (an extension loaded late) resolves immediately: ST writes the
 * third-party settings and THEN emits, so seeing our own key present is proof the load happened.
 */
let settingsLoaded = false;
let resolveLoaded: () => void = () => {};
const loaded = new Promise<void>((resolve) => { resolveLoaded = () => { settingsLoaded = true; resolve(); }; });
const markLoaded = () => { if (!settingsLoaded) resolveLoaded(); };

export const EXTENSION_SETTINGS_LOADED_EVENT = "extension_settings_loaded";

export const settingsReady = (): Promise<void> => {
  if (settingsLoaded) return Promise.resolve();
  // A host with no context at all cannot be confirmed, so the gate opens rather than blocking: the
  // honest reading is "nothing to wait for", and a reader that never resolves would be a hang.
  const settings = (() => { try { return getContext()?.extensionSettings as Record<string, unknown> | undefined; } catch { return undefined; } })();
  if (!settings) return Promise.resolve();
  if (settings["story-orchestrator"]) markLoaded();
  return loaded;
};

export const settingsAreLoaded = (): boolean => settingsLoaded;

export const noteHostSettingsLoaded = (): void => markLoaded();

/** V17: the seam `registerHostMacro` actually registers through, so the capability probe asks it. */
export const hostMacrosAvailable = (): boolean => typeof macrosHost?.MacrosParser?.registerMacro === "function";

const argMacros = argMacroSeam(() => getContext());

export const hostArgMacrosAvailable = (): boolean => argMacros.available();

export const registerHostMacro = (key: string, value: HostMacroValue | HostArgMacro, description?: string): void => {
  if (typeof value === "object") {
    argMacros.register(key, value, description);
    return;
  }
  macrosHost.MacrosParser.registerMacro(key, value, description);
};

export const unregisterHostMacro = (key: string): void => {
  if (argMacros.owns(key)) {
    argMacros.unregister(key);
    return;
  }
  macrosHost.MacrosParser.unregisterMacro(key);
};

export const getPlayerName = (): string => {
  const context = getContext() as unknown as { name1?: string };
  return typeof context.name1 === "string" && context.name1.trim() ? context.name1.trim() : "";
};
