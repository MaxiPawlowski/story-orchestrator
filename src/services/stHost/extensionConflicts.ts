import { isRecord } from "@utils/guards";

export type ExtensionConflict = "stepped-thinking-separated" | "presence" | "prompt-inspector" | "vectors-world-info" | "cc-send-if-empty" | "nemo-lorebook-spacing";

export interface ExtensionConflictHost {
  settings: unknown;
  manifest?: (name: string) => unknown;
  storage?: (key: string) => string | null;
  mainApi?: unknown;
  chatCompletion?: unknown;
}

type Settings = Record<string, unknown> | undefined;

interface KnownExtension {
  id: ExtensionConflict;
  folder: string;
  settingsKey?: string;
  on: (settings: Settings, storage: (key: string) => string | null) => boolean;
}

// Stepped Thinking b79df5e (3.2.0): settings at extension_settings["st-stepped-thinking"] (index.js:27);
// `is_shutdown` stops every listener (thinking/engine.js:46), `mode` "separated" is the deprecated mode that
// posts thoughts as chat messages (thinking/mode.js:98, 600-639), "embedded" keeps them out of the chat;
// thinking runs while `is_enabled` or a character's own `is_setting_enabled` + `is_thinking_enabled` (engine.js:477-490).
const characterThinks = (settings: Settings): boolean => Array.isArray(settings?.character_settings)
  && settings.character_settings.some((entry) => isRecord(entry) && entry.is_setting_enabled === true && entry.is_thinking_enabled === true);

const separatedThinking = (settings: Settings): boolean => Boolean(settings)
  && settings?.is_shutdown !== true
  && settings?.mode === "separated"
  && (settings?.is_enabled !== false || characterThinks(settings));

// Presence 5c97180 (3.1.1): settings at extension_settings.Presence (index.js:8, 12), `enabled` defaults true (:14);
// active in a group only (isActive, :67-69), where it hides unwitnessed messages on GROUP_MEMBER_DRAFTED (:203-219).
const presenceOn = (settings: Settings): boolean => settings?.enabled !== false;

// Prompt Inspector 97a9fd9: the inspect toggle is localStorage "promptInspectorEnabled" (index.js:55-62), and while
// it is "true" every non-dry Generate waits on its popup (GENERATE_AFTER_COMBINE_PROMPTS / CHAT_COMPLETION_PROMPT_READY, :64-126).
const inspecting = (_settings: Settings, storage: (key: string) => string | null): boolean => storage("promptInspectorEnabled") === "true";

// NemoPresetExt 6.0.12: initializeExtension always calls initializeLorebookSpacing (content.js:105), whose
// WORLDINFO_ENTRIES_LOADED listener rewrites every multiword plaintext key on the scan copies to a regex
// (features/lorebook-spacing/runtime.js:7-14, matching.js:26-31); no setting turns it off, so loaded = on.
const nemoSpacing = (): boolean => true;

// Vector Storage: `enabled_world_info` (vectors/index.js:117, 791, 2003-2004); the exclusive lore select reads the
// setting alone (loreExclusive.ts "vectors-wi"), so this one ignores whether the extension is loaded.
export const vectorsWorldInfoOn = (root: unknown): boolean => {
  const vectors = isRecord(root) ? root.vectors : undefined;
  return isRecord(vectors) && vectors.enabled_world_info === true;
};

// Chat Completion's "Replace empty message" (oai_settings.send_if_empty, st-context.js:227 chatCompletionSettings; main_api
// "openai", st-context.js:200): when the last chat prompt message is the assistant's, ST appends it as a user message
// (openai.js:930-931), so a /trigger right after another reply carries a filler line in the prompt only.
const ccFillerOn = (host: ExtensionConflictHost): boolean => host.mainApi === "openai" && isRecord(host.chatCompletion)
  && typeof host.chatCompletion.send_if_empty === "string" && host.chatCompletion.send_if_empty.trim() !== "";

export const KNOWN_EXTENSIONS: readonly KnownExtension[] = [
  { id: "stepped-thinking-separated", folder: "third-party/st-stepped-thinking", settingsKey: "st-stepped-thinking", on: separatedThinking },
  { id: "presence", folder: "third-party/SillyTavern-Presence", settingsKey: "Presence", on: presenceOn },
  { id: "prompt-inspector", folder: "third-party/Extension-PromptInspector", on: inspecting },
  { id: "nemo-lorebook-spacing", folder: "third-party/NemoPresetExt", on: nemoSpacing },
];

const safeStorage = (storage: ExtensionConflictHost["storage"]) => (key: string): string | null => {
  try {
    return storage?.(key) ?? null;
  } catch {
    return null;
  }
};

// Loaded = getExtensionManifest finds it (extensions.js:524-530, st-context.js:300) and the folder is not in
// disabledExtensions (extensions.js:513, 626).
const loaded = (host: ExtensionConflictHost, disabled: ReadonlySet<string>, folder: string): boolean =>
  !disabled.has(folder) && typeof host.manifest === "function" && Boolean(host.manifest(folder));

export function extensionConflictsWith(host: ExtensionConflictHost): ExtensionConflict[] {
  if (!isRecord(host.settings)) return [];
  const root = host.settings;
  const disabled = new Set(Array.isArray(root.disabledExtensions) ? root.disabledExtensions.filter((name): name is string => typeof name === "string") : []);
  const storage = safeStorage(host.storage);
  const found = KNOWN_EXTENSIONS.filter((known) => {
    if (!loaded(host, disabled, known.folder)) return false;
    const settings = known.settingsKey && isRecord(root[known.settingsKey]) ? root[known.settingsKey] as Record<string, unknown> : undefined;
    return known.on(settings, storage);
  }).map((known) => known.id);
  return [...found, ...(vectorsWorldInfoOn(root) ? ["vectors-world-info" as const] : []), ...(ccFillerOn(host) ? ["cc-send-if-empty" as const] : [])];
}
