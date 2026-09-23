import { getContext } from "@services/STAPI";
import type { WizardSessionState } from "@wizard/index";

const SETTINGS_KEY = "wizardSessions";
const SESSION_LIMIT = 8;

// Delegated decision (plan 06): the wizard session lives in extension settings, not in the draft
// store. Setting up a story is install-level authoring work, and it has to survive a page reload —
// an interrupted setup that vanishes on refresh is the failure this is for.
const getRoot = () => {
  const settings = getContext().extensionSettings;
  settings["story-orchestrator"] = settings["story-orchestrator"] ?? {};
  return settings["story-orchestrator"] as Record<string, unknown>;
};

const isSession = (value: unknown): value is WizardSessionState =>
  Boolean(value) && typeof value === "object" && typeof (value as WizardSessionState).key === "string" && Array.isArray((value as WizardSessionState).history);

const listSessions = (): WizardSessionState[] => {
  const stored = getRoot()[SETTINGS_KEY];
  return Array.isArray(stored) ? stored.filter(isSession) : [];
};

export function loadWizardSession(key: string): WizardSessionState | null {
  return listSessions().find((session) => session.key === key) ?? null;
}

export function saveWizardSession(session: WizardSessionState): void {
  const sessions = listSessions();
  const previous = sessions.find((entry) => entry.key === session.key);
  // UI persistence writes ordinary conversation fields after provisioning returns. Grants are
  // written inside the coordinator first; an older UI snapshot must not erase them on its next save.
  // A caller that explicitly includes `grants` owns that field (including `[]` to revoke all).
  const merged = {
    ...session,
    ...(session.grants === undefined && previous?.grants ? { grants: previous.grants } : {}),
    updatedAt: new Date().toISOString(),
  };
  const others = sessions.filter((entry) => entry.key !== session.key);
  const next = [...others, merged]
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
    .slice(0, SESSION_LIMIT);
  getRoot()[SETTINGS_KEY] = next;
  getContext().saveSettingsDebounced();
}

export function clearWizardSession(key: string): void {
  getRoot()[SETTINGS_KEY] = listSessions().filter((session) => session.key !== key);
  getContext().saveSettingsDebounced();
}
