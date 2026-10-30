import { CLOCK_STORY_TIME_KEY, PARTY_LOCATION_KEY, clockStart, type BoundaryLogEntry, type NormalizedStory, type PrimitiveValue } from "@engine/index";
import { entryKnown } from "@engine/codex";
import { currentTime, timeLabel } from "@engine/life/clock";

type Values = Readonly<Record<string, PrimitiveValue>>;
type Resting = (text: string) => string;

export interface NoteRow {
  mes?: unknown;
  extra?: unknown;
  [key: string]: unknown;
}

interface CachedNote {
  boundary: number;
  at: number;
  text: string;
}

const readTime = (story: NormalizedStory, values: Values): number | null => {
  const clock = story.life?.clock;
  if (!clock) return null;
  const time = values[CLOCK_STORY_TIME_KEY];
  return typeof time === "number" ? time : clockStart(clock);
};

export function placeName(story: NormalizedStory, values: Values, resting: Resting): string | null {
  const value = values[PARTY_LOCATION_KEY];
  if (typeof value !== "string" || !value.trim()) return null;
  const places = (story.codex?.places ?? []).filter((entry) => entry.location === value);
  if (places.some((entry) => !entryKnown("places", entry, values))) return null;
  const quality = story.qualityByKey[PARTY_LOCATION_KEY];
  const name = places.find((entry) => entry.name)?.name ?? quality?.player_labels?.[value] ?? value.replace(/_/g, " ");
  return resting(name).trim() === name.trim() ? name.trim() : null;
}

export function noteBetween(story: NormalizedStory, before: Values, after: Values, resting: Resting): string | null {
  const clock = story.life?.clock;
  const timeBefore = readTime(story, before);
  const timeAfter = readTime(story, after);
  const timeMoved = timeAfter !== null && timeAfter !== timeBefore;
  const placeMoved = typeof after[PARTY_LOCATION_KEY] === "string" && after[PARTY_LOCATION_KEY] !== before[PARTY_LOCATION_KEY];
  if (!timeMoved && !placeMoved) return null;
  const place = placeName(story, after, resting);
  if (!timeMoved && !place) return null;
  const time = clock ? timeLabel(clock, story.life?.calendar, currentTime(clock, after)) : null;
  const parts = [time, place].filter((part): part is string => Boolean(part));
  return parts.length ? `[${parts.join(", ")}]` : null;
}

interface NoteGroup {
  messageId: number;
  first: BoundaryLogEntry;
  last: BoundaryLogEntry;
}

const groups = (log: readonly BoundaryLogEntry[]): NoteGroup[] => {
  const byMessage = new Map<number, NoteGroup>();
  for (const entry of log) {
    const messageId = entry.context.lastMessageId + 1;
    const held = byMessage.get(messageId);
    byMessage.set(messageId, held ? { ...held, last: entry } : { messageId, first: entry, last: entry });
  }
  return [...byMessage.values()];
};

export class HistoryNoteCache {
  private scope: string | null = null;
  private notes = new Map<number, CachedNote>();

  read(scope: string, story: NormalizedStory, log: readonly BoundaryLogEntry[], resting: Resting): Map<number, string> {
    if (scope !== this.scope) {
      this.scope = scope;
      this.notes = new Map();
    }
    const floor = log.length ? log[0].boundary : Number.POSITIVE_INFINITY;
    const live = groups(log);
    const kept = new Map(live.map((group) => [group.messageId, group]));
    for (const [messageId, note] of this.notes) {
      const group = kept.get(messageId);
      if (note.boundary < floor && !group) continue;
      if (!group || group.last.boundary !== note.boundary || group.last.at !== note.at) this.notes.delete(messageId);
    }
    for (const group of live) {
      if (this.notes.has(group.messageId)) continue;
      const text = noteBetween(story, group.first.before.blackboard.values, group.last.after.blackboard.values, resting);
      if (text) this.notes.set(group.messageId, { boundary: group.last.boundary, at: group.last.at, text });
    }
    return new Map([...this.notes].map(([messageId, note]) => [messageId, note.text]));
  }

  texts(): string[] {
    return [...new Set([...this.notes.values()].map((note) => note.text))];
  }
}

export function applyHistoryNotes(rows: NoteRow[], idOf: (row: NoteRow) => number | null, notes: ReadonlyMap<number, string>, keepLast: boolean): number {
  let added = 0;
  rows.forEach((row, index) => {
    if (keepLast && index === rows.length - 1) return;
    const id = idOf(row);
    const note = id === null ? undefined : notes.get(id);
    if (!note || typeof row.mes !== "string" || row.mes.startsWith(note)) return;
    row.mes = `${note}\n${row.mes}`;
    added += 1;
  });
  return added;
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function noteShape(story: NormalizedStory): RegExp | null {
  const times = story.life?.clock?.times ?? [];
  if (!times.length) return null;
  return new RegExp(`^\\[(?:Day \\d+|\\d+(?:st|nd|rd|th) of [^,\\]\\n]{1,40}), (?:${times.map(escape).join("|")})(?:, [^\\]\\n]{1,80})?\\]`);
}

export function stripEchoedNote(text: string, known: readonly string[], shape: RegExp | null): string | null {
  const lead = text.match(/^\s*/)?.[0] ?? "";
  const body = text.slice(lead.length);
  const exact = known.find((note) => body.startsWith(note));
  const matched = exact ?? (shape ? body.match(shape)?.[0] : undefined);
  if (!matched) return null;
  const rest = body.slice(matched.length).replace(/^[ \t]*\r?\n?/, "");
  return rest.trim() ? rest : null;
}

export interface HistoryNoteDeps {
  enabled: () => boolean;
  chatId: () => string | null;
  ownedChat: () => string | null;
  story: () => NormalizedStory | null;
  log: () => readonly BoundaryLogEntry[];
  live: () => readonly unknown[];
  resting: () => Resting;
}

export interface EchoReply {
  mes: string;
  reasoning: string;
  isUser: boolean;
  name?: string;
}

export interface HistoryNoteEchoDeps extends HistoryNoteDeps {
  read: (messageId: number) => EchoReply | null;
  write: (messageId: number, text: { mes: string; reasoning: string }) => { ok: boolean };
  journal: (summary: string, note: string) => void;
}

export const NOTE_ECHO_STRIPPED = "A reply opened with a time and place note; the note was taken out";

const scopeOf = (deps: HistoryNoteDeps): { scope: string; story: NormalizedStory } | null => {
  const story = deps.story();
  const chatId = deps.chatId();
  if (!story || chatId === null || chatId !== deps.ownedChat() || !deps.enabled()) return null;
  return { scope: `${chatId}\u0000${story.id ?? story.title}`, story };
};

export const liveIds = (live: readonly unknown[]): ((row: NoteRow) => number | null) => {
  const ids = new Map<unknown, number>();
  live.forEach((message, index) => {
    const extra = (message as { extra?: unknown } | null)?.extra;
    if (extra && typeof extra === "object") ids.set(extra, index);
  });
  return (row) => ids.get(row.extra) ?? null;
};

export const historyNotesPass = (deps: HistoryNoteDeps, cache = new HistoryNoteCache()) => ({
  cache,
  apply: (rows: NoteRow[], type: string, withheld: boolean): number => {
    const owned = withheld ? null : scopeOf(deps);
    if (!owned) return 0;
    const notes = cache.read(owned.scope, owned.story, deps.log(), deps.resting());
    return notes.size ? applyHistoryNotes(rows, liveIds(deps.live()), notes, type === "continue") : 0;
  },
});

export const historyNoteEchoPass = (deps: HistoryNoteEchoDeps, cache: HistoryNoteCache) => (messageId: number): void => {
  const owned = scopeOf(deps);
  const reply = owned ? deps.read(messageId) : null;
  if (!owned || !reply || reply.isUser || !reply.name) return;
  cache.read(owned.scope, owned.story, deps.log(), deps.resting());
  const stripped = stripEchoedNote(reply.mes, cache.texts(), noteShape(owned.story));
  if (stripped === null || !deps.write(messageId, { mes: stripped, reasoning: reply.reasoning }).ok) return;
  deps.journal(NOTE_ECHO_STRIPPED, `message ${messageId}`);
};
