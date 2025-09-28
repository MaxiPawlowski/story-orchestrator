import { WorldInfoActivations } from "./SchemaService/story-schema.js";

const script = await import(
  // @ts-ignore
  /* webpackIgnore: true */ "../../../../../../script.js"
);
const extensions = await import(
  // @ts-ignore
  /* webpackIgnore: true */ "../../../../extensions.js"
);

// @ts-ignore
const chats = await import(/* webpackIgnore: true */ "../../../../chats.js");
const rossAscends = await import(
  // @ts-ignore
  /* webpackIgnore: true */ "../../../../RossAscends-mods.js"
);
const personas = await import(
  // @ts-ignore
  /* webpackIgnore: true */ "../../../../personas.js"
);
export const powerUserWrapper = await import(
  // @ts-ignore
  /* webpackIgnore: true */ "../../../../power-user.js"
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
export const setLogitBias = logit_bias["setLogitBias"];

export const textgen_settings_data = textgen_settings["textgen_settings_data"];
export const tgSettings = textgen_settings["textgenerationwebui_settings"];
export const tgPresetObjs = textgen_settings["textgenerationwebui_presets"];
export const tgPresetNames = textgen_settings["textgenerationwebui_preset_names"];
export const TG_SETTING_NAMES = textgen_settings["setting_names"];
export const setSettingByName = textgen_settings["setSettingByName"];
export const setGenerationParamsFromPreset = script["setGenerationParamsFromPreset"];

export const extension_settings = extensions["extension_settings"];
export const getContext = extensions["getContext"];
export const saveSettingsDebounced = script["saveSettingsDebounced"];
export const eventSource = script["eventSource"];
export const event_types = script["event_types"];
export const currentUserName = script["name1"];
export const chat = script["chat"];
export const extractMessageBias = script["extractMessageBias"];
export const removeMacros = script["removeMacros"];
export const saveChatConditional = script["saveChatConditional"];
export const sendMessageAsUser = script["sendMessageAsUser"];
export const substituteParams = script["substituteParams"];
export const updateMessageBlock = script["updateMessageBlock"];
export const addOneMessage = script["addOneMessage"];
export const generateQuietPrompt = script["generateQuietPrompt"];
export const hideChatMessageRange = chats["hideChatMessageRange"];
export const getMessageTimeStamp = rossAscends["getMessageTimeStamp"];
export const getRequestHeaders = script["getRequestHeaders"];
export const getWorldInfoSettings = worldInfo["getWorldInfoSettings"];
export const loadWorldInfo = worldInfo["loadWorldInfo"];
export const personasFilter = personas["personasFilter"];
export const powerUser = powerUserWrapper["power_user"];

export function getActiveCharacterName(): string | undefined {
  return script["name2"] as string | undefined;
}

export function getActiveCharacterId(): number | undefined {
  const raw = script["this_chid"] as string | number | undefined;
  if (raw === undefined || raw === null || raw === '') return undefined;
  const num = typeof raw === 'string' ? Number.parseInt(raw, 10) : Number(raw);
  return Number.isFinite(num) ? num : undefined;
}

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

// --- lightweight event bus for our plugin ---
export const pluginBus = new EventTarget();

/**
 * Pseudo "Author's Note" via WI: create/enable a WI entry pinned to AN position.
 * We avoid slash-commands and keep prompts clean.
 *
 * @param {string} name unique key for this AN shim (e.g., "__AN_CP2__")
 * @param {string} content text to inject
 * @param {"an_top"|"an_bottom"} position
 */
export function setAuthorsNoteViaWorldInfo(name: string, content: string, position: "an_top" | "an_bottom" = "an_top") {
  try {
    const wi = getWorldInfoSettings();
    wi.world_info = wi.world_info || {};
    wi.world_info.global = wi.world_info.global || [];
    wi.world_info.globalSelect = wi.world_info.globalSelect || [];

    // upsert an entry into global with our content and position hint
    const idx = wi.world_info.global.findIndex((e: any) => e && e.title === name);
    const entry = {
      title: name,
      keys: [name], // self-key; we toggle by selection instead of keyword scan
      content,
      // store position/order as plain fields; ST will map them per build
      position_hint: position, // for your own parser if needed
      insertion_position: position, // some builds read this directly
      order: 999, // push late for higher impact
      constant: true, // hint for some builds
      enabled: true,
    };
    if (idx >= 0) {
      wi.world_info.global[idx] = { ...wi.world_info.global[idx], ...entry };
    } else {
      wi.world_info.global.push(entry);
    }
    if (!wi.world_info.globalSelect.includes(name))
      wi.world_info.globalSelect.push(name);

    saveSettingsDebounced();
    if (typeof loadWorldInfo === "function") loadWorldInfo();
    pluginBus.dispatchEvent(
      new CustomEvent("an:changed", { detail: { name, position } })
    );
    return true;
  } catch (e) {
    console.warn("setAuthorsNoteViaWorldInfo failed", e);
    return false;
  }
}

/**
 * Helper to know if an incoming message is a user message
 */
export function isUserMessage(msg: any): boolean {
  return msg && msg.is_user === true; // common flag; fallback to role/name checks if needed
}


/**
 * BEST-EFFORT: set chat-level CFG scale.
 * Works across builds; per-role routing is handled elsewhere.
 */
export function setChatCFGScale(scale: number | string): boolean {
  try {
    if (extension_settings?.cfg?.chat) {
      extension_settings.cfg.chat.scale = Number(scale);
      saveSettingsDebounced();
      pluginBus.dispatchEvent(new CustomEvent("cfg:changed", { detail: { scope: "chat", scale } }));
      return true;
    }
  } catch (e) {
    console.warn("setChatCFGScale failed", e);
  }
  return false;
}

/**
 * Create/enable a WI entry pinned to AN position, filtered to a CHARACTER.
 * This yields a robust per-role Author's Note.
 */
export function setAuthorsNoteForCharacter({ entryName, characterName, content, position = "an_top" }: {
  entryName: string; characterName: string; content: string; position?: "an_top" | "an_bottom" | "in_chat" | "before_defs" | "after_defs";
}): boolean {
  try {
    const wi = getWorldInfoSettings();
    wi.world_info = wi.world_info || {};
    wi.world_info.global = wi.world_info.global || [];
    wi.world_info.globalSelect = wi.world_info.globalSelect || [];

    const idx = wi.world_info.global.findIndex((e: any) => e?.title === entryName);
    const entry = {
      title: entryName,
      keys: [entryName],            // self-key; we toggle via selection
      content,
      insertion_position: position, // many builds honor this directly
      position_hint: position,      // hint for custom parsers
      order: 1000,                  // late, strong impact
      constant: true,
      enabled: true,
      // Character Filter (include mode)
      character_filter: { include: [characterName], exclude: [], mode: "include" },
    };

    if (idx >= 0) {
      wi.world_info.global[idx] = { ...wi.world_info.global[idx], ...entry };
    } else {
      wi.world_info.global.push(entry);
    }
    if (!wi.world_info.globalSelect.includes(entryName)) wi.world_info.globalSelect.push(entryName);

    saveSettingsDebounced();
    if (typeof loadWorldInfo === "function") loadWorldInfo();
    pluginBus.dispatchEvent(new CustomEvent("an:changed", { detail: { characterName, entryName, position } }));
    return true;
  } catch (e) {
    console.warn("setAuthorsNoteForCharacter failed", e);
    return false;
  }
}

/**
 * Generic WI toggler (activate/deactivate/make_constant by title name).
 */
export function updateWorldInfoEntries({ activate = [], deactivate = [], make_constant = [] }: WorldInfoActivations) {
  try {
    const wi = getWorldInfoSettings();
    wi.world_info = wi.world_info || {};
    wi.world_info.global = wi.world_info.global || [];
    wi.world_info.globalSelect = wi.world_info.globalSelect || [];

    for (const name of activate) {
      if (!wi.world_info.globalSelect.includes(name)) wi.world_info.globalSelect.push(name);
    }
    wi.world_info.globalSelect = wi.world_info.globalSelect.filter((n: string) => !deactivate.includes(n));

    wi.world_info._plugin_constants = Array.from(
      new Set([...(wi.world_info._plugin_constants || []), ...make_constant])
    );

    saveSettingsDebounced();
    if (typeof loadWorldInfo === "function") loadWorldInfo();
    pluginBus.dispatchEvent(new CustomEvent("wi:changed", { detail: { activate, deactivate, make_constant } }));
    return true;
  } catch (e) {
    console.warn("updateWorldInfoEntries failed", e);
    return false;
  }
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