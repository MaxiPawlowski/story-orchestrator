import {
  AUTHOR_NOTE_DEFAULT_DEPTH,
  AUTHOR_NOTE_DEFAULT_INTERVAL,
  AUTHOR_NOTE_DISABLED_FREQUENCY,
  AUTHOR_NOTE_LOG_SAMPLE_LIMIT,
  UI_SYNC_MAX_ATTEMPTS,
  UI_SYNC_RETRY_DELAY_MS,
} from "@constants/defaults";

function importSTModule<T>(path: string): Promise<T> {
  return import(/* webpackIgnore: true */ path);
}

const script = await importSTModule<typeof import("../../../../../../public/script.js")>("/script.js");
const group = await importSTModule<typeof import("../../../../../../public/scripts/group-chats.js")>("/scripts/group-chats.js");
const extensions = await importSTModule<typeof import("../../../../../../public/scripts/extensions.js")>("/scripts/extensions.js");
const macros = await importSTModule<typeof import("../../../../../../public/scripts/macros.js")>("/scripts/macros.js");
const worldInfo = await importSTModule<typeof import("../../../../../../public/scripts/world-info.js")>("/scripts/world-info.js");
const textgen_settings = await importSTModule<typeof import("../../../../../../public/scripts/textgen-settings.js")>("/scripts/textgen-settings.js");
const logit_bias = await importSTModule<typeof import("../../../../../../public/scripts/logit-bias.js")>("/scripts/logit-bias.js");
const rossMods = await importSTModule<typeof import("../../../../../../public/scripts/RossAscends-mods.js")>("/scripts/RossAscends-mods.js");

export const BIAS_CACHE = logit_bias["BIAS_CACHE"];
export const displayLogitBias = logit_bias["displayLogitBias"];
export const tgSettings = textgen_settings["textgenerationwebui_settings"];
export const tgPresetObjs = textgen_settings["textgenerationwebui_presets"];
export const tgPresetNames = textgen_settings["textgenerationwebui_preset_names"];
export const TG_SETTING_NAMES = textgen_settings["setting_names"];
export const setSettingByName = textgen_settings["setSettingByName"];
export const setGenerationParamsFromPreset = script["setGenerationParamsFromPreset"];

export const extension_settings = extensions["extension_settings"] as Record<string, any>;
export const getContext = extensions["getContext"];
export const saveMetadataDebounced = extensions["saveMetadataDebounced"];
export const saveSettingsDebounced = script["saveSettingsDebounced"];
export const eventSource = script["eventSource"];
export const event_types = script["event_types"];
export const chat = script["chat"];
export const characters = script["characters"];
export const selected_group = group["selected_group"] as string | null | undefined;


/**
 * Background generation based on the provided prompt.
 * @typedef {object} GenerateQuietPromptParams
 * @prop {string} [quietPrompt] Instruction prompt for the AI
 * @prop {boolean} [quietToLoud] Whether the message should be sent in a foreground (loud) or background (quiet) mode
 * @prop {boolean} [skipWIAN] Whether to skip addition of World Info and Author's Note into the prompt
 * @prop {string} [quietImage] Image to use for the quiet prompt
 * @prop {string} [quietName] Name to use for the quiet prompt (defaults to "System:")
 * @prop {number} [responseLength] Maximum response length. If unset, the global default value is used.
 * @prop {number} [forceChId] Character ID to use for this generation run. Works in groups only.
 * @prop {object} [jsonSchema] JSON schema to use for the structured generation. Usually requires a special instruction.
 * @prop {boolean} [removeReasoning] Parses and removes the reasoning block according to reasoning format preferences
 * @prop {boolean} [trimToSentence] Whether to trim the response to the last complete sentence
 * @param {GenerateQuietPromptParams} params Parameters for the quiet prompt generation
 * @returns {Promise<string>} Generated text. If using structured output, will contain a serialized JSON object.
 */
// export async function generateQuietPrompt({ quietPrompt = '', quietToLoud = false, skipWIAN = false, quietImage = null, quietName = null, responseLength = null, forceChId = null, jsonSchema = null, removeReasoning = true, trimToSentence = false } = {}) {

export const generateQuietPrompt = script["generateQuietPrompt"];
export const generateRaw = script["generateRaw"];
export const getWorldInfoSettings = worldInfo["getWorldInfoSettings"];
export const MacrosParser = macros["MacrosParser"];
export const addOneMessage = script["addOneMessage"];
export const saveChatConditional = script["saveChatConditional"];
export const getMessageTimeStamp = rossMods["getMessageTimeStamp"];
export const getThumbnailUrl = script["getThumbnailUrl"];
export const chat_metadata = script["chat_metadata"] as Record<string, any>;
export const substituteParams = script["substituteParams"];

export function getCharacterNameById(id: number | string | undefined): string | undefined {
  if (id === undefined || id === null || id === '') return undefined;
  const index = typeof id === 'string' ? Number.parseInt(id, 10) : Number(id);
  if (!Number.isFinite(index) || index < 0) return undefined;
  const list = script["characters"] as Array<{ name?: string }> | undefined;
  if (!Array.isArray(list)) return undefined;
  const entry = list[index];
  if (!entry) return undefined;
  const name = entry.name;
  return typeof name === 'string' ? name : undefined;
}

export function getCharacterIdByName(name?: string | null): number | undefined {
  if (!name) return undefined;
  try {
    const list = (script as any)["characters"] as Array<{ name?: string }> | undefined;
    if (!Array.isArray(list)) return undefined;
    const lower = String(name).trim();
    for (let i = 0; i < list.length; i++) {
      const n = list[i]?.name;
      if (typeof n === 'string' && n === lower) return i;
      if (typeof n === 'string' && n.trim().toLowerCase() === lower.toLowerCase()) return i;
    }
  } catch (e) {
    console.warn("[Story - getCharacterIdByName] failed", e);
  }
  return undefined;
}
type ANPosition = "after" | "chat" | "before"; // 0,1,2 in author_note.js terms
type ANRole = "system" | "user" | "assistant"; // 0,1,2

async function runSlash(cmd: string, silent = true) {
  const { executeSlashCommandsWithOptions } = getContext();

  let toastrData = {
    success: window?.toastr?.success,
    info: window?.toastr?.info,
  }

  if (silent) {
    if (toastrData.success && window.toastr) window.toastr.success = () => { };
    if (toastrData.info && window.toastr) window.toastr.info = () => { };
  }

  try {
    const res = await executeSlashCommandsWithOptions(cmd, {
      handleParserErrors: true,
      handleExecutionErrors: true,
    });
    if (res?.isError) {
      console.warn("[Story A/N slash] error:", cmd, res?.errorMessage);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[Story A/N slash] threw:", cmd, err);
    return false;
  } finally {
    if (silent && window?.toastr) {
      if (toastrData.success && window.toastr) window.toastr.success = toastrData.success;
      if (toastrData.info && window.toastr) window.toastr.info = toastrData.info;
    }
  }
}

function quoteArg(s: string) {
  return `"${String(s)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, "\\n")}"`;
}

export async function executeSlashCommands(
  commands: Iterable<string> | string,
  opts?: { silent?: boolean; delayMs?: number },
) {
  const silent = opts?.silent ?? true;
  const delayMs = Math.max(0, opts?.delayMs ?? 0);
  const iterable = typeof commands === "string" ? [commands] : Array.from(commands ?? []);
  let allOk = true;


  try {
    for (let i = 0; i < iterable.length; i++) {
      const command = typeof iterable[i] === "string" ? iterable[i] : "";
      const ok = await runSlash(command, silent);
      if (!ok) {
        allOk = false;
      }
      if (delayMs > 0 && i < iterable.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

  } catch (error) {
    console.warn("[Story Slash] failed to execute commands", error);
  }


  return allOk;
}


export async function applyCharacterAN(
  text: string,
  opts?: { position?: ANPosition; depth?: number; interval?: number; role?: ANRole }
) {
  const position: ANPosition = opts?.position ?? "chat";
  const depth = Math.max(0, (opts?.depth ?? AUTHOR_NOTE_DEFAULT_DEPTH) | 0);
  const interval = Math.max(1, (opts?.interval ?? AUTHOR_NOTE_DEFAULT_INTERVAL) | 0); // default = every user msg
  const role: ANRole = opts?.role ?? "system";

  console.log("[Story A/N slash] applying", {
    role, position, depth, interval,
    sample: String(text).slice(0, AUTHOR_NOTE_LOG_SAMPLE_LIMIT),
  });

  // await runSlash(`/note-role ${role}`);
  await runSlash(`/note-position ${position}`);
  await runSlash(`/note-depth ${depth}`);
  await runSlash(`/note-frequency ${interval}`);

  const ok = await runSlash(`/note ${quoteArg(text ?? "")}`);
  if (!ok) {
    await runSlash(`/note ${quoteArg("")}`);
  }
}

export async function clearCharacterAN() {
  await runSlash(`/note ${quoteArg("")}`);
  await runSlash(`/note-frequency ${AUTHOR_NOTE_DISABLED_FREQUENCY}`);
}

export async function enableWIEntry(lorebook: string, comments: string | string[]) {
  if (!lorebook) return false;
  const commentList = (Array.isArray(comments) ? comments : [comments])
    .map((comment) => (typeof comment === "string" ? comment.trim() : ""))
    .filter(Boolean);
  if (!commentList.length) return false;
  const { loadWorldInfo } = getContext();
  const loadedInfo = await loadWorldInfo(lorebook);
  if (!loadedInfo) {
    console.warn("[Story WI] failed to load lorebook", { lorebook });
    return false;
  }
  const { entries }: Lorebook = loadedInfo as Lorebook;
  const entriesArray = Object.values(entries);
  const matched: Array<{ comment: string; uid: number }> = [];

  for (const comment of commentList) {
    const found = entriesArray.find((e) => typeof e?.comment === "string" && e.comment.trim() === comment);
    if (!found) {
      console.warn("[Story WI] no matching world info entry found", { lorebook, comment });
      continue;
    }
    matched.push({ comment, uid: found.uid });
  }

  if (!matched.length) {
    return false;
  }

  let allOk = true;
  for (let i = 0; i < matched.length; i++) {
    const entry = matched[i];
    const ok = await runSlash(`/setentryfield file=${quoteArg(lorebook)} uid=${entry.uid} field=disable 0`, false);
    if (!ok) {
      console.warn("[Story WI] failed to enable world info entry", { lorebook, comment: entry.comment, uid: entry.uid });
      allOk = false;
    }
    if (i < matched.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  return allOk;
}

export async function disableWIEntry(lorebook: string, comments: string | string[]) {
  if (!lorebook) return false;
  const commentList = (Array.isArray(comments) ? comments : [comments])
    .map((comment) => (typeof comment === "string" ? comment.trim() : ""))
    .filter(Boolean);
  if (!commentList.length) return false;
  const { loadWorldInfo } = getContext();
  const loadedInfo = await loadWorldInfo(lorebook);
  if (!loadedInfo) {
    console.warn("[Story WI] failed to load lorebook", { lorebook });
    return false;
  }
  const { entries }: Lorebook = loadedInfo as Lorebook;
  const entriesArray = Object.values(entries);
  const matched: Array<{ comment: string; uid: number }> = [];

  for (const comment of commentList) {
    const found = entriesArray.find((e) => typeof e?.comment === "string" && e.comment.trim() === comment);
    if (!found) {
      console.warn("[Story WI] no matching world info entry found", { lorebook, comment });
      continue;
    }
    matched.push({ comment, uid: found.uid });
  }

  if (!matched.length) {
    return false;
  }

  let allOk = true;
  for (let i = 0; i < matched.length; i++) {
    const entry = matched[i];
    const ok = await runSlash(`/setentryfield file=${quoteArg(lorebook)} uid=${entry.uid} field=disable 1`, false);
    if (!ok) {
      console.warn("[Story WI] failed to disable world info entry", { lorebook, comment: entry.comment, uid: entry.uid });
      allOk = false;
    }
    if (i < matched.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  return allOk;
}


(function attachUiBridge() {
  console.log('[ST UI Bridge] Initializing UI Bridge');
  const applySettingWithRetry = (key: string, value: any, attempt = 0) => {
    if (typeof setSettingByName !== 'function') {
      console.warn(`[ST UI Bridge] setSettingByName not available`);
      return;
    }

    let lastError: unknown | null = null;
    try {
      setSettingByName(key, value, true);
    } catch (error) {
      lastError = error as unknown;
    }

    const inputId = `${key}_textgenerationwebui`;
    const sliderId = `${key}_textgenerationwebui_zenslider`;
    const hasTarget = Boolean(document.getElementById(inputId) || document.getElementById(sliderId));

    if (hasTarget && lastError == null) {
      return;
    }

    if (attempt >= UI_SYNC_MAX_ATTEMPTS) {
      if (lastError != null) {
        console.warn(`[ST UI Bridge] Skipped UI sync for ${key} after ${attempt + 1} attempts`, lastError);
      } else if (!hasTarget) {
        console.warn(`[ST UI Bridge] Gave up waiting for UI controls for ${key}`);
      }
      return;
    }

    setTimeout(() => applySettingWithRetry(key, value, attempt + 1), UI_SYNC_RETRY_DELAY_MS);
  };

  (window as any).ST_applyTextgenPresetToUI = function apply(name: string, presetObj: any) {
    try {
      for (const key of TG_SETTING_NAMES) {
        if (Object.prototype.hasOwnProperty.call(presetObj, key)) {
          applySettingWithRetry(key, presetObj[key]);
        }
      }
      tgSettings.preset = name;
      const sel = document.getElementById('settings_preset_textgenerationwebui') as HTMLSelectElement | null;
      if (sel) {
        sel.value = name;
      }
      console.log('[ST UI Bridge] Applied preset to UI:', name);
    } catch (err) {
      console.warn('[ST UI Bridge] Failed to apply preset to UI', err);
    }
  };
})();


export interface Lorebook {
  entries: Record<number, LoreEntry>;
}

export interface LoreEntry {
  uid: number;
  comment: string;

  [key: string]: any
}

