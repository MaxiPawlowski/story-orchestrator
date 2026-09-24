import type { RunGuard } from "./runToken";
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

export interface LibrarySaveDeps {
  observe: () => Promise<SettingsSaveObservation>;
  /** The server's stored library records, `[]` when it holds none, null when it could not be read. */
  readBack: () => Promise<unknown[] | null>;
}

export type LibrarySaveEvidence = { confirmed: true } | { confirmed: false; reason: string };

const observedReason = (observation: SettingsSaveObservation) => observation.timedOut ? "no settings save request went out"
  : observation.failed ? "the settings save request failed before the server answered"
    : `the settings save answered ${String(observation.status)}`;

const stampOf = (value: unknown) => Date.parse(String(value ?? "")) || 0;

/** Null when the server holds this record or a later save of it; otherwise what it holds instead. */
export function missingFromServer(stored: unknown[] | null, record: Pick<StoryLibraryRecord, "id" | "version" | "updatedAt">): string | null {
  if (stored === null) return "the server's settings could not be read back";
  const held = stored.find((entry): entry is { version?: unknown; updatedAt?: unknown } => Boolean(entry) && typeof entry === "object" && (entry as { id?: unknown }).id === record.id);
  if (!held) return "the server's library does not hold it";
  const version = typeof held.version === "number" ? held.version : 0;
  if (version > record.version || (version === record.version && stampOf(held.updatedAt) >= stampOf(record.updatedAt))) return null;
  return `the server holds v${version} saved ${String(held.updatedAt ?? "at an unknown time")}`;
}

/** v2.4 E3: the same evidence for any install-wide write: the observed settings save, then what the
 *  server's copy holds, read once per burst. `missing` answers null when the server holds the write. */
export function createSettingsWriteEvidence<T>(deps: LibrarySaveDeps, missing: (stored: unknown[] | null, write: T) => string | null): (write: T) => Promise<LibrarySaveEvidence> {
  let lastBurst: { burst: number; read: Promise<unknown[] | null> } | null = null;
  const readOnce = (burst: number | undefined) => {
    if (burst === undefined) return deps.readBack();
    if (lastBurst?.burst !== burst) lastBurst = { burst, read: deps.readBack() };
    return lastBurst.read;
  };
  return async (write) => {
    const observation = await deps.observe();
    if (!observation.ok) return { confirmed: false, reason: observedReason(observation) };
    const reason = missing(await readOnce(observation.burst), write);
    return reason ? { confirmed: false, reason } : { confirmed: true };
  };
}

export const createLibrarySaveEvidence = (deps: LibrarySaveDeps): (record: StoryLibraryRecord) => Promise<LibrarySaveEvidence> => createSettingsWriteEvidence(deps, missingFromServer);

/** The reason goes to the journal of the chat the write was made from, and only while that chat is still open. */
export async function journalSettingsWrite(summary: string, label: string, evidence: Promise<LibrarySaveEvidence>, run: RunGuard, journal: (summary: string, note: string) => void): Promise<LibrarySaveEvidence> {
  const outcome = await evidence;
  if (outcome.confirmed || !run.stillOwns()) return outcome;
  journal(summary, `${label}: ${outcome.reason}`);
  return outcome;
}

export const librarySaveSentence = (record: Pick<StoryLibraryRecord, "title" | "version">, evidence: LibrarySaveEvidence) => evidence.confirmed
  ? `Saved “${record.title}” v${record.version} to the library.`
  : `Saving “${record.title}” v${record.version}… not confirmed: ${evidence.reason}.`;

/** The reason goes to the journal of the chat the save was made from, and only while that chat is still open. */
export const journalLibrarySave = (record: Pick<StoryLibraryRecord, "title" | "version">, evidence: Promise<LibrarySaveEvidence>, run: RunGuard, journal: (summary: string, note: string) => void): Promise<LibrarySaveEvidence> =>
  journalSettingsWrite("library save not confirmed", `“${record.title}” v${record.version}`, evidence, run, journal);
