import { getContext, observeNextSettingsSave, readServerExtensionSettings } from "@services/STAPI";
import type { WizardSessionState } from "@wizard/index";
import { createSettingsWriteEvidence, type LibrarySaveEvidence } from "./librarySave";

const ROOT_KEY = "story-orchestrator";
const SETTINGS_KEY = "wizardSessions";
const SESSION_LIMIT = 8;

type SessionWrite = { key: string; updatedAt: string | null };

export interface WizardSessionSave {
  summary: string;
  label: string;
  evidence: Promise<LibrarySaveEvidence>;
}

const stampOf = (value: unknown) => Date.parse(String(value ?? "")) || 0;

const missingSession = (stored: unknown[] | null, write: SessionWrite): string | null => {
  if (stored === null) return "the server's settings could not be read back";
  const held = stored.find((entry): entry is { updatedAt?: unknown } => Boolean(entry) && typeof entry === "object" && (entry as { key?: unknown }).key === write.key);
  if (write.updatedAt === null) return held ? "the server still holds this session" : null;
  if (!held) return "the server does not hold this session";
  return stampOf(held.updatedAt) >= stampOf(write.updatedAt) ? null : `the server holds this session as saved ${String(held.updatedAt ?? "at an unknown time")}`;
};

const confirmSessionWrite = createSettingsWriteEvidence<SessionWrite>({
  observe: () => observeNextSettingsSave(),
  readBack: async () => {
    const root = await readServerExtensionSettings(ROOT_KEY);
    return root === null ? null : Array.isArray(root[SETTINGS_KEY]) ? (root[SETTINGS_KEY] as unknown[]) : [];
  },
}, missingSession);

let sessionSaveListener: ((save: WizardSessionSave) => void) | null = null;

export function onWizardSessionSave(listener: (save: WizardSessionSave) => void): () => void {
  sessionSaveListener = listener;
  return () => { if (sessionSaveListener === listener) sessionSaveListener = null; };
}

const writeSessions = (sessions: WizardSessionState[], write: SessionWrite): Promise<LibrarySaveEvidence> => {
  getRoot()[SETTINGS_KEY] = sessions;
  const evidence = confirmSessionWrite(write);
  getContext().saveSettingsDebounced();
  sessionSaveListener?.({ summary: `wizard session ${write.updatedAt === null ? "clear" : "save"} not confirmed`, label: `wizard session ${write.key}`, evidence });
  return evidence;
};

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

export function saveWizardSession(session: WizardSessionState): Promise<LibrarySaveEvidence> {
  const sessions = listSessions();
  const previous = sessions.find((entry) => entry.key === session.key);
  // UI persistence writes ordinary conversation fields after provisioning returns. Grants are
  // written inside the coordinator first; an older UI snapshot must not erase them on its next save.
  // A caller that explicitly includes `grants` owns that field (including `[]` to revoke all).
  // V18: a session first stored from now on records which of its assets are books; one stored
  // before keeps no such list, and ownership then falls back to its whole ledger.
  const createdLorebooks = session.createdLorebooks ?? previous?.createdLorebooks ?? (previous ? undefined : []);
  const merged = {
    ...session,
    ...(session.grants === undefined && previous?.grants ? { grants: previous.grants } : {}),
    ...(createdLorebooks === undefined ? {} : { createdLorebooks }),
    updatedAt: new Date().toISOString(),
  };
  const others = sessions.filter((entry) => entry.key !== session.key);
  const next = [...others, merged]
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
    .slice(0, SESSION_LIMIT);
  return writeSessions(next, { key: session.key, updatedAt: merged.updatedAt });
}

export function clearWizardSession(key: string): Promise<LibrarySaveEvidence> {
  return writeSessions(listSessions().filter((session) => session.key !== key), { key, updatedAt: null });
}
