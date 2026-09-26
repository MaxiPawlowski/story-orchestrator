// V20d (S6, S7, S12): the decisions behind a journey's config and library cleanup, pure so they are tested
// without a browser. Each one narrows what a run may remove when it cannot prove what it found.

type Root = Record<string, unknown> & { v2Stories?: unknown; wizardSessions?: unknown };

const idOfStory = (record: unknown): string | null => {
  const id = (record as { id?: unknown } | null)?.id;
  return typeof id === 'string' ? id : null;
};
const keyOfSession = (session: unknown): string | null => {
  const key = (session as { key?: unknown } | null)?.key;
  return typeof key === 'string' ? key : null;
};

/**
 * S12. A restore writes the pre-run snapshot back, but the library and the wizard's sessions are shared
 * with every other session on the install: a story imported, or a wizard session started, after the
 * snapshot is kept rather than erased. `settings` is restored as captured.
 */
export function mergeRestore(next: Root | null, live: Root | null): { next: Root | null; preservedStories: string[]; preservedSessions: string[] } {
  if (next === null) return { next: null, preservedStories: [], preservedSessions: [] };
  const merged: Root = { ...next };
  const preservedStories: string[] = [];
  const preservedSessions: string[] = [];
  const liveStories = Array.isArray(live?.v2Stories) ? live.v2Stories : [];
  const stories = Array.isArray(next.v2Stories) ? [...next.v2Stories] : [];
  const knownStories = new Set(stories.map(idOfStory).filter(Boolean));
  for (const record of liveStories) {
    const id = idOfStory(record);
    if (id && !knownStories.has(id)) { stories.push(record); preservedStories.push(id); }
  }
  if (stories.length) merged.v2Stories = stories;
  const liveSessions = Array.isArray(live?.wizardSessions) ? live.wizardSessions : [];
  const sessions = Array.isArray(next.wizardSessions) ? [...next.wizardSessions] : [];
  const knownSessions = new Set(sessions.map(keyOfSession).filter(Boolean));
  for (const session of liveSessions) {
    const key = keyOfSession(session);
    if (key && !knownSessions.has(key)) { sessions.push(session); preservedSessions.push(key); }
  }
  if (sessions.length) merged.wizardSessions = sessions;
  return { next: merged, preservedStories, preservedSessions };
}

export interface LibraryCapture {
  /** False when the extension settings could not be read at all, so an empty list proves nothing. */
  trusted: boolean;
  /** The whole library as it was, record for record: a restore writes these back verbatim. */
  records: unknown[];
}

export interface LibraryRestorePlan {
  untrusted: boolean;
  next: unknown[];
  /** Records the run left that were not in the library before it (`id@version (hash)`). */
  removed: string[];
  /** Records that existed before and were changed or removed by the run, put back as they were. */
  restored: string[];
  changed: boolean;
}

const fieldOf = (record: unknown, key: string): unknown => (record && typeof record === 'object' ? (record as Record<string, unknown>)[key] : undefined);
const libraryKey = (record: unknown): string => idOfStory(record) ?? `hash:${String(fieldOf(record, 'hash') ?? JSON.stringify(record))}`;
const libraryLabel = (record: unknown): string => `${idOfStory(record) ?? '?'}@${String(fieldOf(record, 'version') ?? '?')} (${String(fieldOf(record, 'hash') ?? 'no hash')})`;

/**
 * S12 / v2.5 plan 02 H1. Cleanup puts the library back to the snapshot taken before the run, keyed by
 * story id: a record that existed is written back exactly as it was (an import under the same id, or an
 * edited re-import, replaced it), and a record that was not there is removed. Matching by the hash the
 * run played deleted a same-id story the install already had, and left an edited re-import behind.
 * An untrusted capture changes nothing.
 */
export function planLibraryRestore(before: LibraryCapture | null | undefined, current: unknown[]): LibraryRestorePlan {
  if (!before?.trusted) return { untrusted: true, next: current, removed: [], restored: [], changed: false };
  const was = new Map(before.records.map((record) => [libraryKey(record), record]));
  const now = new Map(current.map((record) => [libraryKey(record), record]));
  const removed = current.filter((record) => !was.has(libraryKey(record))).map(libraryLabel);
  const restored = before.records.filter((record) => JSON.stringify(now.get(libraryKey(record))) !== JSON.stringify(record)).map(libraryLabel);
  const next = before.records.map((record) => structuredClone(record));
  return { untrusted: false, next, removed, restored, changed: JSON.stringify(current) !== JSON.stringify(before.records) };
}

/**
 * S7. A crashed run that cleared the config leaves the root empty (or holding only the defaults the
 * runtime writes back on its next read), and the next run's snapshot would capture that. The snapshot
 * file is marked `restoredAt` once a run puts it back, so an UNRESTORED snapshot is exactly a run that
 * died between clearing and restoring. Setup recovers only that, and only over a root that looks cleared.
 */
export function shouldRecoverConfig(liveKeys: string[], snapshot: { present?: boolean; value?: unknown; restoredAt?: unknown } | null): boolean {
  if (!snapshot?.present || snapshot.restoredAt) return false;
  if (liveKeys.some((key) => key !== 'settings')) return false;
  const value = snapshot.value;
  return Boolean(value && typeof value === 'object' && Object.keys(value as object).length);
}

/**
 * S10. Host dialogs setup must not click through. Each one either means another writer touched this
 * chat, or its OK button writes to the install. Anything else is closed with its cancel control.
 */
export const BLOCKING_DIALOGS: ReadonlyArray<{ match: string; why: string }> = [
  { match: 'integrity check failed', why: 'ST refused a save because the chat file on disk disagrees with the page — another writer touched this chat. Clicking OK reloads (safe); typing OVERWRITE destroys whatever the file holds that the page does not.' },
  { match: 'Welcome back', why: 'the away-recap popup. It is a host modal, so a scripted send retries against it and times out. The product closes it on every world change (S3, 2026-09-21); one still open here means the run is on a chat the recap outlived, or another session raised it.' },
  { match: 'has an embedded World/Lorebook', why: "ST's embedded-lorebook import confirm (world-info.js:5708). Its OK imports a lorebook into the install, and it raises once per card, so a run that clicked through would write a book nobody asked for." },
];

export function blockingDialogFor(text: string): { match: string; why: string } | null {
  const lower = text.toLowerCase();
  return BLOCKING_DIALOGS.find((entry) => lower.includes(entry.match.toLowerCase())) ?? null;
}

export interface DeclaredExtraction {
  cadence: number;
  stabilityLag: number;
  profile: 'inherit';
}

/**
 * Plan 01 §E: extraction settings are install-wide, so a journey that does not declare them runs on
 * whatever the last session left. Every journey states the cadence and lag it was measured at; the
 * profile is inherited (a named profile is `configureExtraction`'s job, through the real panel).
 */
export function validateJourneyExtraction(setup: unknown): string[] {
  const where = 'setup.extraction';
  const record = setup && typeof setup === 'object' ? setup as Record<string, unknown> : {};
  const problems: string[] = [];
  if ('cadence' in record) problems.push('setup.cadence moved to setup.extraction.cadence');
  const extraction = record.extraction;
  if (!extraction || typeof extraction !== 'object' || Array.isArray(extraction)) {
    problems.push(`${where} is required ({cadence, stabilityLag, profile: "inherit"}): without it the run inherits whatever the last session left`);
    return problems;
  }
  const value = extraction as Record<string, unknown>;
  for (const key of Object.keys(value)) if (!['cadence', 'stabilityLag', 'profile'].includes(key)) problems.push(`${where}.${key} is not a declared setting`);
  if (!Number.isInteger(value.cadence) || (value.cadence as number) < 1) problems.push(`${where}.cadence must be an integer >= 1`);
  if (!Number.isInteger(value.stabilityLag) || (value.stabilityLag as number) < 0) problems.push(`${where}.stabilityLag must be an integer >= 0`);
  if (value.profile !== 'inherit') problems.push(`${where}.profile must be "inherit"`);
  return problems;
}
