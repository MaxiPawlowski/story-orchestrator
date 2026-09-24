import type { RunGuard } from "./runToken";
import { ServedRequests } from "./saveEvidence";
import type { StoryLibraryRecord } from "./types";

// v2.4 plan 02 §7 (T8). A library write is `saveSettingsDebounced()`, and ST's `saveSettings` swallows
// its own failure (H15), so "the Studio saved" was never evidence the server holds the record. What
// is: a settings save answered 2xx after the write, and the server's own `v2Stories` holding this
// record (or a later save of it), read back once per save burst because the read is heavy (H16).

export interface SettingsSaveObservation {
  requested: boolean;
  status: number | null;
  ok: boolean;
  timedOut: boolean;
  failed: boolean;
  burst?: number;
}

export interface SettingsWriteDeps<S> {
  observe: () => Promise<SettingsSaveObservation>;
  /** The server's stored copy of what the write touched; null when it could not be read. */
  readBack: () => Promise<S | null>;
}

/** The server's stored library records, `[]` when it holds none. */
export type LibrarySaveDeps = SettingsWriteDeps<unknown[]>;

/** `request` names the settings request whose own answer refused the write, so one refusal is one row. */
export type LibrarySaveEvidence = { confirmed: true } | { confirmed: false; reason: string; request?: number };

const observedReason = (observation: SettingsSaveObservation) => observation.timedOut ? "no settings save request went out"
  : observation.failed ? "the settings save request failed before the server answered"
    : `the settings save answered ${String(observation.status)}`;

const stampOf = (value: unknown) => Date.parse(String(value ?? "")) || 0;

const UNREADABLE = "the server's settings could not be read back";

/** Null when the server holds this record or a later save of it; otherwise what it holds instead. */
export function missingFromServer(stored: unknown[] | null, record: Pick<StoryLibraryRecord, "id" | "version" | "updatedAt">): string | null {
  if (stored === null) return UNREADABLE;
  const held = stored.find((entry): entry is { version?: unknown; updatedAt?: unknown } => Boolean(entry) && typeof entry === "object" && (entry as { id?: unknown }).id === record.id);
  if (!held) return "the server's library does not hold it";
  const version = typeof held.version === "number" ? held.version : 0;
  if (version > record.version || (version === record.version && stampOf(held.updatedAt) >= stampOf(record.updatedAt))) return null;
  return `the server holds v${version} saved ${String(held.updatedAt ?? "at an unknown time")}`;
}

const entryWithId = (stored: unknown[], id: string) => stored.find((entry): entry is { updatedAt?: unknown } => Boolean(entry) && typeof entry === "object" && (entry as { id?: unknown }).id === id);

/** v2.4 E3: a removal is held once the server no longer holds the record, or holds a save of it made since. */
export function stillHeldByServer(stored: unknown[] | null, removal: { id: string; at: string }): string | null {
  if (stored === null) return UNREADABLE;
  const held = entryWithId(stored, removal.id);
  return !held || stampOf(held.updatedAt) > stampOf(removal.at) ? null : "the server's library still holds it";
}

/** v2.4 E3: the read-time migration rekeys records by id; the server holds it once it holds every id. */
export function missingMigrated(stored: unknown[] | null, ids: string[]): string | null {
  if (stored === null) return UNREADABLE;
  const absent = ids.filter((id) => !entryWithId(stored, id));
  return absent.length ? `the server's library does not hold ${absent.join(", ")}` : null;
}

/** v2.4 E3: the same evidence for any install-wide write: the observed settings save, then what the
 *  server's copy holds, read once per burst. `missing` answers null when the server holds the write. */
export function createSettingsWriteEvidence<T, S = unknown[]>(deps: SettingsWriteDeps<S>, missing: (stored: S | null, write: T) => string | null): (write: T) => Promise<LibrarySaveEvidence> {
  let lastBurst: { burst: number; read: Promise<S | null> } | null = null;
  const readOnce = (burst: number | undefined) => {
    if (burst === undefined) return deps.readBack();
    if (lastBurst?.burst !== burst) lastBurst = { burst, read: deps.readBack() };
    return lastBurst.read;
  };
  return async (write) => {
    const observation = await deps.observe();
    if (!observation.ok) return { confirmed: false, reason: observedReason(observation), ...(observation.burst === undefined ? {} : { request: observation.burst }) };
    const reason = missing(await readOnce(observation.burst), write);
    return reason ? { confirmed: false, reason } : { confirmed: true };
  };
}

export const createLibrarySaveEvidence = (deps: LibrarySaveDeps): (record: StoryLibraryRecord) => Promise<LibrarySaveEvidence> => createSettingsWriteEvidence(deps, missingFromServer);

export interface SettingsWrite {
  summary: string;
  label: string;
  evidence: Promise<LibrarySaveEvidence>;
}

let settingsWriteListener: ((write: SettingsWrite) => void) | null = null;

/** v2.4 E3: the runtime hears every library and settings-store write; one listener, like the chat writes. */
export function onSettingsWrite(listener: (write: SettingsWrite) => void): () => void {
  settingsWriteListener = listener;
  return () => { if (settingsWriteListener === listener) settingsWriteListener = null; };
}

/** Arms the write's evidence only while something listens: a page with no runtime pays no read-back. */
export function recordSettingsWrite(summary: string, label: string, arm: () => Promise<LibrarySaveEvidence>): Promise<LibrarySaveEvidence> | null {
  const listener = settingsWriteListener;
  if (!listener) return null;
  const evidence = arm();
  listener({ summary, label, evidence });
  return evidence;
}

const journaledRequests = new ServedRequests();

/** The reason goes to the journal of the chat the write was made from, and only while that chat is still
 *  open. A settings request that refused several writes is one row, journaled by the first of them. */
export async function journalSettingsWrite(summary: string, label: string, evidence: Promise<LibrarySaveEvidence>, run: RunGuard, journal: (summary: string, note: string) => void): Promise<LibrarySaveEvidence> {
  const outcome = await evidence;
  if (outcome.confirmed || !run.stillOwns() || !journaledRequests.claim(outcome.request)) return outcome;
  journal(summary, `${label}: ${outcome.reason}`);
  return outcome;
}

export const librarySaveSentence = (record: Pick<StoryLibraryRecord, "title" | "version">, evidence: LibrarySaveEvidence) => evidence.confirmed
  ? `Saved “${record.title}” v${record.version} to the library.`
  : `Saving “${record.title}” v${record.version}… not confirmed: ${evidence.reason}.`;
