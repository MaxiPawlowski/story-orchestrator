import { getContext } from "@services/STAPI";

export const SETTINGS_ROOT_KEY = "story-orchestrator";

/** v2.5 plan 11: the install-wide root's shape baseline. A read never writes it; the next write does,
 *  whatever the root held before, because each field's sanitizer already falls back on a bad value. */
export const SETTINGS_SCHEMA = 1;

export const settingsRoot = (): Record<string, unknown> => {
  const settings = getContext().extensionSettings;
  settings[SETTINGS_ROOT_KEY] = settings[SETTINGS_ROOT_KEY] ?? {};
  return settings[SETTINGS_ROOT_KEY] as Record<string, unknown>;
};

export const stampSchema = (root: Record<string, unknown>): Record<string, unknown> => {
  root.schema = SETTINGS_SCHEMA;
  return root;
};

export const writableSettingsRoot = (): Record<string, unknown> => stampSchema(settingsRoot());
