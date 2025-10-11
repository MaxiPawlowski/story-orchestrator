import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { extension_settings, saveSettingsDebounced } from "@services/SillyTavernAPI";
import { extensionName } from "@constants/main";
import { DEFAULT_INTERVAL_TURNS } from "@utils/story-state";
import { DEFAULT_ARBITER_PROMPT } from "@services/CheckpointArbiterService";

export interface ExtensionRuntimeSettings {
  arbiterPrompt: string;
  arbiterFrequency: number;
}

const CONFIG_KEY = "config";
const PROMPT_MAX_LENGTH = 1200;

export const DEFAULT_EXTENSION_SETTINGS: ExtensionRuntimeSettings = Object.freeze({
  arbiterPrompt: DEFAULT_ARBITER_PROMPT,
  arbiterFrequency: DEFAULT_INTERVAL_TURNS,
});

interface ExtensionSettingsContextValue extends ExtensionRuntimeSettings {
  defaultArbiterPrompt: string;
  setArbiterPrompt: (value: string) => void;
  resetArbiterPrompt: () => void;
  setArbiterFrequency: (value: number) => void;
}

const ExtensionSettingsContext = createContext<ExtensionSettingsContextValue | undefined>(undefined);

function getSettingsRoot(): Record<string, unknown> {
  const root = extension_settings[extensionName];
  if (root && typeof root === "object") {
    return root as Record<string, unknown>;
  }
  const created: Record<string, unknown> = {};
  extension_settings[extensionName] = created;
  return created;
}

function sanitizeFrequency(value: unknown): number {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return DEFAULT_EXTENSION_SETTINGS.arbiterFrequency;
  const floored = Math.floor(raw);
  if (floored < 1) return 1;
  if (floored > 99) return 99;
  return floored;
}

function sanitizePrompt(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_EXTENSION_SETTINGS.arbiterPrompt;
  const normalized = value.replace(/\r/g, "").trim();
  if (!normalized) return DEFAULT_EXTENSION_SETTINGS.arbiterPrompt;
  if (normalized.length > PROMPT_MAX_LENGTH) {
    return normalized.slice(0, PROMPT_MAX_LENGTH);
  }
  return normalized;
}

function loadSettings(): ExtensionRuntimeSettings {
  const root = getSettingsRoot();
  const raw = root[CONFIG_KEY];
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_EXTENSION_SETTINGS };
  }
  const candidate = raw as Partial<ExtensionRuntimeSettings>;
  return {
    arbiterPrompt: sanitizePrompt(candidate.arbiterPrompt),
    arbiterFrequency: sanitizeFrequency(candidate.arbiterFrequency),
  };
}

function persistSettings(next: ExtensionRuntimeSettings) {
  const root = getSettingsRoot();
  root[CONFIG_KEY] = { ...next };
  try {
    saveSettingsDebounced();
  } catch (err) {
    console.warn("[ExtensionSettings] Failed to persist settings", err);
  }
}

export const ExtensionSettingsProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [settings, setSettings] = useState<ExtensionRuntimeSettings>(() => loadSettings());

  const applySettings = useCallback((partial: Partial<ExtensionRuntimeSettings>) => {
    setSettings((prev) => {
      const next: ExtensionRuntimeSettings = {
        arbiterPrompt: partial.arbiterPrompt !== undefined
          ? sanitizePrompt(partial.arbiterPrompt)
          : prev.arbiterPrompt,
        arbiterFrequency: partial.arbiterFrequency !== undefined
          ? sanitizeFrequency(partial.arbiterFrequency)
          : prev.arbiterFrequency,
      };
      persistSettings(next);
      return next;
    });
  }, []);

  const setArbiterPrompt = useCallback((value: string) => {
    applySettings({ arbiterPrompt: value });
  }, [applySettings]);

  const resetArbiterPrompt = useCallback(() => {
    applySettings({ arbiterPrompt: DEFAULT_EXTENSION_SETTINGS.arbiterPrompt });
  }, [applySettings]);

  const setArbiterFrequency = useCallback((value: number) => {
    applySettings({ arbiterFrequency: value });
  }, [applySettings]);

  const value = useMemo<ExtensionSettingsContextValue>(() => ({
    arbiterPrompt: settings.arbiterPrompt,
    arbiterFrequency: settings.arbiterFrequency,
    defaultArbiterPrompt: DEFAULT_EXTENSION_SETTINGS.arbiterPrompt,
    setArbiterPrompt,
    resetArbiterPrompt,
    setArbiterFrequency,
  }), [settings, setArbiterPrompt, resetArbiterPrompt, setArbiterFrequency]);

  return (
    <ExtensionSettingsContext.Provider value={value}>
      {children}
    </ExtensionSettingsContext.Provider>
  );
};

export function useExtensionSettings(): ExtensionSettingsContextValue {
  const ctx = useContext(ExtensionSettingsContext);
  if (!ctx) {
    throw new Error("useExtensionSettings must be used within an ExtensionSettingsProvider");
  }
  return ctx;
}

