import { ServedRequests } from "./saveEvidence";
import type { StoryLibraryRecord } from "./types";

// A library write is `saveSettingsDebounced()`, and ST's `saveSettings` swallows
// its own failure, so "the Studio saved" was never evidence the server holds the record. What
// is: a settings save answered 2xx after the write, and the server's own `v2Stories` holding this
// record (or a later save of it), read back once per save burst because the read is heavy.

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

export interface ChatSaveOutcome {
  applied: boolean;
  detail: string;
}

export const chatSaveSentence = (outcome: ChatSaveOutcome): string => `${outcome.applied ? "Applied" : "Not applied"} to this chat: ${outcome.detail}.`;

export const NO_CHAT_OPEN = "no-chat";

export type ChatSaveAnswer = ChatSaveOutcome | typeof NO_CHAT_OPEN | null;

export const chatSaveHalf = (watched: boolean, taken: ChatSaveAnswer): string =>
  (!watched || taken === NO_CHAT_OPEN ? "" : ` ${chatSaveSentence(taken ?? { applied: false, detail: "it is playing a different story" })}`);

export interface ChatUpdateResult {
  applied: boolean;
  choice: "keep" | "restart" | "cancel" | null;
  fromVersion: number | null;
  reason?: string;
}

export const chatUpdateOutcome = (outcome: ChatUpdateResult): ChatSaveOutcome | null => {
  if (outcome.applied) return { applied: true, detail: outcome.choice === "restart" ? "this chat restarted on the new version" : "this chat is playing the new version now" };
  if (outcome.choice === "cancel") return { applied: false, detail: outcome.fromVersion !== null ? `this chat keeps playing v${outcome.fromVersion}` : "this chat keeps the version it is playing" };
  return outcome.reason ? { applied: false, detail: outcome.reason } : null;
};

export const chatUpdateSentence = (outcome: ChatUpdateResult | null | undefined): string | null => {
  const taken = outcome ? chatUpdateOutcome(outcome) : null;
  return taken ? chatSaveSentence(taken) : null;
};

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

/** A removal is held once the server no longer holds the record, or holds a save of it made since. */
export function stillHeldByServer(stored: unknown[] | null, removal: { id: string; at: string }): string | null {
  if (stored === null) return UNREADABLE;
  const held = entryWithId(stored, removal.id);
  return !held || stampOf(held.updatedAt) > stampOf(removal.at) ? null : "the server's library still holds it";
}

/** The same evidence for any install-wide write: the observed settings save, then what the
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

const settingsWriteListeners = new Set<(write: SettingsWrite) => void>();

/** The runtime hears every library and settings-store write. the lorebook gating listens
 *  too (a library save can grow a gated set), so a second listener joins the journal's instead of replacing it. */
export function onSettingsWrite(listener: (write: SettingsWrite) => void): () => void {
  settingsWriteListeners.add(listener);
  return () => { settingsWriteListeners.delete(listener); };
}

/** Arms the write's evidence only while something listens: a page with no runtime pays no read-back. */
export function recordSettingsWrite(summary: string, label: string, arm: () => Promise<LibrarySaveEvidence>): Promise<LibrarySaveEvidence> | null {
  if (!settingsWriteListeners.size) return null;
  const evidence = arm();
  [...settingsWriteListeners].forEach((listener) => listener({ summary, label, evidence }));
  return evidence;
}

const journaledRequests = new ServedRequests();

export interface OpenChat {
  chatId: string;
  integrity: string | null;
}

/** Install-wide evidence belongs to the chat open when the write started, not to the run: a story load
 *  in that same chat (an import selects what it saved) is not a reason to drop it. */
export interface WriteChatScope {
  stillOpen(): boolean;
}

export const sameOpenChat = (started: OpenChat | null, now: OpenChat | null): boolean =>
  (started?.chatId ?? null) === (now?.chatId ?? null) && (!started?.integrity || !now?.integrity || started.integrity === now.integrity);

export function scopeToOpenChat(read: () => OpenChat | null): WriteChatScope {
  const started = read();
  return { stillOpen: () => sameOpenChat(started, read()) };
}

/** The reason goes to the journal of the chat the write was made from, and only while that chat is still
 *  open. A settings request that refused several writes is one row, journaled by the first of them. */
export async function journalSettingsWrite(
  summary: string,
  label: string,
  evidence: Promise<LibrarySaveEvidence>,
  chat: WriteChatScope,
  journal: (summary: string, note: string) => void,
): Promise<LibrarySaveEvidence> {
  const outcome = await evidence;
  if (outcome.confirmed || !chat.stillOpen() || !journaledRequests.claim(outcome.request)) return outcome;
  journal(summary, `${label}: ${outcome.reason}`);
  return outcome;
}

export const savedToLibrarySentence = (record: Pick<StoryLibraryRecord, "title" | "version">) => `Saved “${record.title}” v${record.version} to the library.`;

export const librarySaveSentence = (record: Pick<StoryLibraryRecord, "title" | "version">, evidence: LibrarySaveEvidence) => evidence.confirmed
  ? savedToLibrarySentence(record)
  : `Saving “${record.title}” v${record.version}… not confirmed: ${evidence.reason}.`;
