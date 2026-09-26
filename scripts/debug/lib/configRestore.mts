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
  hashes: string[];
}

/**
 * S6. Which imported stories cleanup may delete. An untrusted "before" is not "the library was empty":
 * it removes nothing, and says what it kept, because deleting a story the user had is the worse error.
 */
export function removableStories(imported: string[], before: LibraryCapture | string[] | null | undefined): { remove: string[]; kept: string[]; untrusted: boolean } {
  const unique = [...new Set(imported)];
  const capture: LibraryCapture | null = Array.isArray(before) ? { trusted: true, hashes: before } : before ?? null;
  if (!capture || !capture.trusted) return { remove: [], kept: unique, untrusted: true };
  const existed = new Set(capture.hashes);
  return { remove: unique.filter((hash) => !existed.has(hash)), kept: unique.filter((hash) => existed.has(hash)), untrusted: false };
}

/**
 * A25. What an import step added to the library, whether or not the import reported success: a
 * refused import (`expectFail`) can still leave its record behind, and reports no hash for it.
 */
export function addedStoryHashes(before: LibraryCapture, after: LibraryCapture): string[] {
  if (!before.trusted || !after.trusted) return [];
  const existed = new Set(before.hashes);
  return [...new Set(after.hashes.filter((hash) => !existed.has(hash)))];
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
