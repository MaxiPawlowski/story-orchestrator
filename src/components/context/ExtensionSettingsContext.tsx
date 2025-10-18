import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { extension_settings, saveSettingsDebounced } from "@services/SillyTavernAPI";
import { extensionName } from "@constants/main";
import {
  DEFAULT_SANITIZED_ARBITER_FREQUENCY,
  DEFAULT_SANITIZED_ARBITER_PROMPT,
  sanitizeArbiterFrequency,
  sanitizeArbiterPrompt,
  type ArbiterFrequency,
  type ArbiterPrompt,
} from "@utils/arbiter";

export interface ExtensionRuntimeSettings {
  arbiterPrompt: ArbiterPrompt;
  arbiterFrequency: ArbiterFrequency;
}

const CONFIG_KEY = "config";

export const DEFAULT_EXTENSION_SETTINGS: ExtensionRuntimeSettings = Object.freeze({
  arbiterPrompt: DEFAULT_SANITIZED_ARBITER_PROMPT,
  arbiterFrequency: DEFAULT_SANITIZED_ARBITER_FREQUENCY,
});

interface ExtensionSettingsContextValue extends ExtensionRuntimeSettings {
  defaultArbiterPrompt: ArbiterPrompt;
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

function loadSettings(): ExtensionRuntimeSettings {
  const root = getSettingsRoot();
  const raw = root[CONFIG_KEY];
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_EXTENSION_SETTINGS };
  }
  const candidate = raw as Partial<ExtensionRuntimeSettings>;
  return {
    arbiterPrompt: sanitizeArbiterPrompt(candidate.arbiterPrompt),
    arbiterFrequency: sanitizeArbiterFrequency(candidate.arbiterFrequency),
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

type SettingsUpdate = Partial<{ arbiterPrompt: unknown; arbiterFrequency: unknown }>;

export const ExtensionSettingsProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [settings, setSettings] = useState<ExtensionRuntimeSettings>(() => loadSettings());

  const applySettings = useCallback((partial: SettingsUpdate) => {
    setSettings((prev) => {
      const next: ExtensionRuntimeSettings = {
        arbiterPrompt: partial.arbiterPrompt !== undefined
          ? sanitizeArbiterPrompt(partial.arbiterPrompt)
          : prev.arbiterPrompt,
        arbiterFrequency: partial.arbiterFrequency !== undefined
          ? sanitizeArbiterFrequency(partial.arbiterFrequency)
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

