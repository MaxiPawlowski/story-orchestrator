import {
  AUTHOR_NOTE_DEFAULT_DEPTH,
  AUTHOR_NOTE_DEFAULT_INTERVAL,
  AUTHOR_NOTE_DISABLED_FREQUENCY,
  AUTHOR_NOTE_LOG_SAMPLE_LIMIT,
} from "@constants/defaults";
import { quoteSlashArg } from "@utils/string";

function importSTModule<T>(path: string): Promise<T> {
  return import(/* webpackIgnore: true */ path);
}

const script = await importSTModule<typeof import("../../../../../../public/script.js")>("/script.js");
const extensions = await importSTModule<typeof import("../../../../../../public/scripts/extensions.js")>("/scripts/extensions.js");
const macros = await importSTModule<typeof import("../../../../../../public/scripts/macros.js")>("/scripts/macros.js");
const worldInfo = await importSTModule<typeof import("../../../../../../public/scripts/world-info.js")>("/scripts/world-info.js");
const textgen_settings = await importSTModule<typeof import("../../../../../../public/scripts/textgen-settings.js")>("/scripts/textgen-settings.js");
const logit_bias = await importSTModule<typeof import("../../../../../../public/scripts/logit-bias.js")>("/scripts/logit-bias.js");
const rossMods = await importSTModule<typeof import("../../../../../../public/scripts/RossAscends-mods.js")>("/scripts/RossAscends-mods.js");

export const BIAS_CACHE = logit_bias["BIAS_CACHE"];
export const displayLogitBias = logit_bias["displayLogitBias"];
export const tgPresetObjs = textgen_settings["textgenerationwebui_presets"];
export const tgPresetNames = textgen_settings["textgenerationwebui_preset_names"];
export const TG_SETTING_NAMES = textgen_settings["setting_names"];
export const setSettingByName = textgen_settings["setSettingByName"];
export const getContext = extensions["getContext"];
export const setGenerationParamsFromPreset = script["setGenerationParamsFromPreset"];
export const getWorldInfoSettings = worldInfo["getWorldInfoSettings"];
export const MacrosParser = macros["MacrosParser"];
export const getMessageTimeStamp = rossMods["getMessageTimeStamp"];



export function getCharacterNameById(id: number | undefined): string | undefined {
  if (id === undefined) return undefined;
  const characters = script["characters"];
  return characters[id]?.name;
}

export function getCharacterIdByName(name: string): number | undefined {
  if (!name) return undefined;
  const characters = script["characters"];
  const searchName = name.trim().toLowerCase();
  return characters.findIndex(char => char.name?.trim().toLowerCase() === searchName);
}

export function getAllCharacterNames(): string[] {
  try {
    const characters = script["characters"];
    if (!Array.isArray(characters)) return [];
    return characters
      .map(char => char?.name)
      .filter((name): name is string => typeof name === "string" && name.trim().length > 0)
      .map(name => name.trim());
  } catch (err) {
    console.warn("[Story - STAPI] Failed to get character names", err);
    return [];
  }
}
type ANPosition = "after" | "chat" | "before"; // 0,1,2 in author_note.js terms
type ANRole = "system" | "user" | "assistant"; // 0,1,2

async function runSlash(cmd: string, silent = true) {
  const { executeSlashCommandsWithOptions } = getContext();

  const toastrData = {
    success: window?.toastr?.success,
    info: window?.toastr?.info,
  }

  if (silent && window?.toastr) {
    window.toastr.success = () => void (0);
    window.toastr.info = () => void (0);
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
      if (toastrData.success) window.toastr.success = toastrData.success;
      if (toastrData.info) window.toastr.info = toastrData.info;
    }
  }
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
  const position = opts?.position ?? "chat";
  const depth = opts?.depth ?? AUTHOR_NOTE_DEFAULT_DEPTH;
  const interval = opts?.interval ?? AUTHOR_NOTE_DEFAULT_INTERVAL;
  const role = opts?.role ?? "system";

  console.log("[Story A/N slash] applying", {
    role, position, depth, interval,
    sample: text.slice(0, AUTHOR_NOTE_LOG_SAMPLE_LIMIT),
  });

  await runSlash(`/note-position ${position}`);
  await runSlash(`/note-depth ${depth}`);
  await runSlash(`/note-frequency ${interval}`);

  const ok = await runSlash(`/note ${quoteSlashArg(text ?? "")}`);
  if (!ok) {
    await runSlash(`/note ${quoteSlashArg("")}`);
  }
}

export async function clearCharacterAN() {
  await runSlash(`/note ${quoteSlashArg("")}`);
  await runSlash(`/note-frequency ${AUTHOR_NOTE_DISABLED_FREQUENCY}`);
}

export async function enableWIEntry(lorebook: string, comments: string | string[]) {
  if (!lorebook) return false;
  const commentList = (Array.isArray(comments) ? comments : [comments]).filter(Boolean);
  if (!commentList.length) return false;

  const { loadWorldInfo } = getContext();
  const loadedInfo = await loadWorldInfo(lorebook) as Lorebook | null;
  if (!loadedInfo) {
    console.warn("[Story WI] failed to load lorebook", { lorebook });
    return false;
  }

  const entries = Object.values(loadedInfo.entries);
  const matched: Array<{ comment: string; uid: number }> = [];

  for (const comment of commentList) {
    const found = entries.find(e => e.comment?.trim() === comment);
    if (!found) {
      console.warn("[Story WI] no matching world info entry found", { lorebook, comment });
      continue;
    }
    matched.push({ comment, uid: found.uid });
  }

  if (!matched.length) return false;

  let allOk = true;
  for (let i = 0; i < matched.length; i++) {
    const entry = matched[i];
    const ok = await runSlash(`/setentryfield file=${quoteSlashArg(lorebook)} uid=${entry.uid} field=disable 0`, false);
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
  const commentList = (Array.isArray(comments) ? comments : [comments]).filter(Boolean);
  if (!commentList.length) return false;

  const { loadWorldInfo } = getContext();
  const loadedInfo = await loadWorldInfo(lorebook) as Lorebook | null;
  if (!loadedInfo) {
    console.warn("[Story WI] failed to load lorebook", { lorebook });
    return false;
  }

  const entries = Object.values(loadedInfo.entries);
  const matched: Array<{ comment: string; uid: number }> = [];

  for (const comment of commentList) {
    const found = entries.find(e => e.comment?.trim() === comment);
    if (!found) {
      console.warn("[Story WI] no matching world info entry found", { lorebook, comment });
      continue;
    }
    matched.push({ comment, uid: found.uid });
  }

  if (!matched.length) return false;

  let allOk = true;
  for (let i = 0; i < matched.length; i++) {
    const entry = matched[i];
    const ok = await runSlash(`/setentryfield file=${quoteSlashArg(lorebook)} uid=${entry.uid} field=disable 1`, false);
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



export interface Lorebook {
  entries: Record<number, LoreEntry>;
}

export interface LoreEntry {
  uid: number;
  comment: string;

  [key: string]: any
}

