import { clone } from "@utils/checkpoint-studio";
import { getContext } from "@services/SillyTavernAPI";
import type { PresetSettingKey } from "@constants/presetSettingKeys";

const NUMERIC_LITERAL_RE = /^-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

export const stringifyPresetValue = (value: unknown): string => {
  if (value === undefined) return "";
  if (value === null) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

export const parsePresetValue = (raw: string): unknown => {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const lastChar = trimmed.charAt(trimmed.length - 1);
  if (lastChar === "." || lastChar === "e" || lastChar === "E" || lastChar === "+" || lastChar === "-") {
    return raw;
  }
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;
  if (NUMERIC_LITERAL_RE.test(trimmed)) {
    const num = Number(trimmed);
    return Number.isFinite(num) ? num : raw;
  }
  const firstChar = trimmed.charAt(0);
  if (
    (firstChar === "{" && trimmed.endsWith("}")) ||
    (firstChar === "[" && trimmed.endsWith("]")) ||
    (firstChar === "\"" && trimmed.endsWith("\""))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return raw;
    }
  }
  return raw;
};

const clonePresetValue = (value: unknown): unknown => {
  if (Array.isArray(value) || (value && typeof value === "object")) {
    try {
      return clone(value);
    } catch {
      try {
        return JSON.parse(JSON.stringify(value));
      } catch {
        return value;
      }
    }
  }
  return value;
};

export const readCurrentPresetValue = (key: PresetSettingKey): unknown => {
  try {
    const { textCompletionSettings } = getContext();
    // TODO: fix any
    const base = (textCompletionSettings as any)?.[key];
    return clonePresetValue(base);
  } catch {
    return "";
  }
};

