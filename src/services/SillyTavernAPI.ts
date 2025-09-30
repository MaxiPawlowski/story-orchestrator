declare global {
  interface Toastr {
    success?: (...args: any[]) => any;
    info?: (...args: any[]) => any;
  }
  interface Window {
    toastr?: Toastr;
  }
}

const script = await import(
  // @ts-ignore
  /* webpackIgnore: true */ "../../../../../../script.js"
);
const extensions = await import(
  // @ts-ignore
  /* webpackIgnore: true */ "../../../../extensions.js"
);
const worldInfo = await import(
  // @ts-ignore
  /* webpackIgnore: true */ "../../../../world-info.js"
);
const textgen_settings = await import(
  // @ts-ignore
  /* webpackIgnore: true */ "../../../../textgen-settings.js"
);
const logit_bias = await import(
  // @ts-ignore
  /* webpackIgnore: true */ "../../../../logit-bias.js"
);

export const BIAS_CACHE = logit_bias["BIAS_CACHE"];
export const displayLogitBias = logit_bias["displayLogitBias"];
export const tgSettings = textgen_settings["textgenerationwebui_settings"];
export const tgPresetObjs = textgen_settings["textgenerationwebui_presets"];
export const tgPresetNames = textgen_settings["textgenerationwebui_preset_names"];
export const TG_SETTING_NAMES = textgen_settings["setting_names"];
export const setSettingByName = textgen_settings["setSettingByName"];
export const setGenerationParamsFromPreset = script["setGenerationParamsFromPreset"];

export const extension_settings = extensions["extension_settings"];
export const getContext = extensions["getContext"];
export const saveMetadataDebounced = extensions["saveMetadataDebounced"];
export const saveSettingsDebounced = script["saveSettingsDebounced"];
export const eventSource = script["eventSource"];
export const event_types = script["event_types"];
export const chat = script["chat"];
export const generateQuietPrompt = script["generateQuietPrompt"];
export const getWorldInfoSettings = worldInfo["getWorldInfoSettings"];

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


export async function applyCharacterAN(
  text: string,
  opts?: { position?: ANPosition; depth?: number; interval?: number; role?: ANRole }
) {
  const position: ANPosition = opts?.position ?? "chat";
  const depth = Math.max(0, (opts?.depth ?? 4) | 0);
  const interval = Math.max(1, (opts?.interval ?? 1) | 0); // 1 = every user msg
  const role: ANRole = opts?.role ?? "system";

  console.log("[Story A/N slash] applying", {
    role, position, depth, interval,
    sample: String(text).slice(0, 80),
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
  await runSlash(`/note-frequency 0`);
}



(function attachUiBridge() {
  const MAX_UI_SYNC_ATTEMPTS = 20;
  const UI_SYNC_DELAY_MS = 100;
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

    if (attempt >= MAX_UI_SYNC_ATTEMPTS) {
      if (lastError != null) {
        console.warn(`[ST UI Bridge] Skipped UI sync for ${key} after ${attempt + 1} attempts`, lastError);
      } else if (!hasTarget) {
        console.warn(`[ST UI Bridge] Gave up waiting for UI controls for ${key}`);
      }
      return;
    }

    setTimeout(() => applySettingWithRetry(key, value, attempt + 1), UI_SYNC_DELAY_MS);
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
