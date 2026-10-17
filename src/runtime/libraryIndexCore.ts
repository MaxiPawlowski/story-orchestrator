import { isRecord } from "@utils/guards";

export const LIBRARY_INDEX_FILE = "so-library-index.json";

export interface IndexEntry {
  at: string;
  hash?: string;
  gone?: true;
}

export interface LibraryIndex {
  v: 1;
  stories: Record<string, IndexEntry>;
  sessions: Record<string, IndexEntry>;
}

export interface LibraryIndexDelta {
  stories?: Record<string, string | null>;
  sessions?: Record<string, true | null>;
}

export interface LibraryLost {
  stories: string[];
  sessions: string[];
  changed: string[];
}

export interface LibraryHeld {
  stories: ReadonlyArray<{ id: string; hash: string }>;
  sessions: readonly string[];
}

export const emptyIndex = (): LibraryIndex => ({ v: 1, stories: {}, sessions: {} });

const entries = (value: unknown): Record<string, IndexEntry> => (isRecord(value) ? Object.fromEntries(Object.entries(value).flatMap(([id, entry]) => {
  if (!isRecord(entry) || typeof entry.at !== "string") return [];
  return [[id, { at: entry.at, ...(typeof entry.hash === "string" ? { hash: entry.hash } : {}), ...(entry.gone === true ? { gone: true as const } : {}) }]];
})) : {});

export const parseIndex = (value: unknown): LibraryIndex =>
  (isRecord(value) && value.v === 1 ? { v: 1, stories: entries(value.stories), sessions: entries(value.sessions) } : emptyIndex());

const applied = <T>(current: Record<string, IndexEntry>, delta: Record<string, T | null> | undefined, at: string, entryOf: (value: T) => IndexEntry): Record<string, IndexEntry> => {
  const next = { ...current };
  for (const [id, value] of Object.entries(delta ?? {})) next[id] = value === null ? { at, gone: true } : entryOf(value);
  return next;
};

export const mergeIndex = (index: LibraryIndex, delta: LibraryIndexDelta, at: string): LibraryIndex => ({
  v: 1,
  stories: applied(index.stories, delta.stories, at, (hash: string) => ({ at, hash })),
  sessions: applied(index.sessions, delta.sessions, at, () => ({ at })),
});

export const findLost = (index: LibraryIndex, held: LibraryHeld): LibraryLost => {
  const hashes = new Map(held.stories.map((story) => [story.id, story.hash]));
  const sessions = new Set(held.sessions);
  const live = (entries: Record<string, IndexEntry>) => Object.entries(entries).filter(([, entry]) => !entry.gone);
  return {
    stories: live(index.stories).filter(([id]) => !hashes.has(id)).map(([id]) => id).sort(),
    sessions: live(index.sessions).filter(([key]) => !sessions.has(key)).map(([key]) => key).sort(),
    changed: live(index.stories).filter(([id, entry]) => hashes.has(id) && entry.hash !== undefined && entry.hash !== hashes.get(id)).map(([id]) => id).sort(),
  };
};

export const seedDelta = (index: LibraryIndex, held: LibraryHeld): LibraryIndexDelta | null => {
  const stories = Object.fromEntries(held.stories.filter((story) => !index.stories[story.id]).map((story) => [story.id, story.hash]));
  const sessions = Object.fromEntries(held.sessions.filter((key) => !index.sessions[key]).map((key) => [key, true as const]));
  return Object.keys(stories).length || Object.keys(sessions).length ? { stories, sessions } : null;
};

export const acknowledgeDelta = (reported: LibraryLost, held: LibraryHeld): LibraryIndexDelta => {
  const hashes = new Map(held.stories.map((story) => [story.id, story.hash]));
  const heldSessions = new Set(held.sessions);
  return {
    stories: Object.fromEntries([
      ...reported.stories.filter((id) => !hashes.has(id)).map((id) => [id, null] as const),
      ...reported.changed.flatMap((id) => { const hash = hashes.get(id); return hash === undefined ? [] : [[id, hash] as const]; }),
    ]),
    sessions: Object.fromEntries(reported.sessions.filter((key) => !heldSessions.has(key)).map((key) => [key, null] as const)),
  };
};

export const withoutReported = (lost: LibraryLost | null, reported: LibraryLost): LibraryLost | null => {
  if (!lost) return null;
  const left = (ids: string[], gone: string[]) => ids.filter((id) => !gone.includes(id));
  const next = { stories: left(lost.stories, reported.stories), sessions: left(lost.sessions, reported.sessions), changed: left(lost.changed, reported.changed) };
  return anyLost(next) ? next : null;
};

export const anyLost = (lost: LibraryLost | null | undefined): lost is LibraryLost => Boolean(lost && (lost.stories.length || lost.sessions.length || lost.changed.length));
