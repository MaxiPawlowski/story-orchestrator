import { termPresent } from "@utils/termPresent";
import { contentWords, restatesWords, sharedCount } from "./words";

export const MENTION_KINDS = ["row", "arc", "line"] as const;
export type MentionKind = typeof MENTION_KINDS[number];

export interface OfferedItem {
  id: string;
  kind: MentionKind;
  text: string;
  triggers?: readonly string[];
}

export interface MentionRecord {
  id: string;
  kind: MentionKind;
  member: string;
  messageId: number;
  revision: string;
  boundary: number;
}

export interface MentionsState {
  records: MentionRecord[];
}

export const MENTION_RECORD_CAP = 400;
export const MENTION_HOLD_BOUNDARIES = 6;
export const TRIGGER_MIN_LENGTH = 4;
export const RAISE_MIN_SHARED = 2;

export const createMentions = (): MentionsState => ({ records: [] });

const namesWords = (names: readonly string[]): Set<string> => new Set(names.flatMap((name) => [...contentWords(name)]));

const without = (words: ReadonlySet<string>, drop: ReadonlySet<string>): Set<string> => new Set([...words].filter((word) => !drop.has(word)));

export function usedInReply(items: readonly OfferedItem[], reply: string, speakerNames: readonly string[] = []): string[] {
  if (!reply.trim()) return [];
  const replyWords = contentWords(reply);
  const own = namesWords(speakerNames);
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    const words = without(contentWords(item.text), own);
    if (restatesWords(words, replyWords)) return true;
    return (item.triggers ?? []).some((trigger) => trigger.trim().length >= TRIGGER_MIN_LENGTH && !own.has(trigger.trim().toLowerCase()) && termPresent(reply, trigger.trim()));
  }).map((item) => item.id);
}

export function recordMentions(state: MentionsState, ids: readonly string[], items: readonly OfferedItem[], at: Omit<MentionRecord, "id" | "kind">): MentionsState {
  const kinds = new Map(items.map((item) => [item.id, item.kind]));
  const kept = state.records.filter((record) => !(record.messageId === at.messageId && record.member === at.member));
  const added = ids.flatMap((id): MentionRecord[] => (kinds.has(id) ? [{ id, kind: kinds.get(id) as MentionKind, ...at }] : []));
  return { records: [...kept, ...added].slice(-MENTION_RECORD_CAP) };
}

export const rollbackMentions = (state: MentionsState, messageId: number): MentionsState =>
  ({ records: state.records.filter((record) => record.messageId < messageId) });

const isMentionRecord = (value: unknown): value is MentionRecord => {
  if (!value || typeof value !== "object") return false;
  const row = value as MentionRecord;
  return typeof row.id === "string" && (MENTION_KINDS as readonly string[]).includes(row.kind) && typeof row.member === "string"
    && Number.isInteger(row.messageId) && typeof row.revision === "string" && Number.isInteger(row.boundary);
};

export const sanitizeMentions = (value: unknown): MentionsState => {
  const records = (value as Partial<MentionsState> | null)?.records;
  return { records: (Array.isArray(records) ? records : []).filter(isMentionRecord).slice(-MENTION_RECORD_CAP) };
};

export interface RaiseProbe {
  text: string;
  entities: readonly string[];
  triggers: readonly string[];
}

export function raisedBy(probe: RaiseProbe, playerText: string, rosterNames: readonly string[]): boolean {
  if (!playerText.trim()) return false;
  const cast = namesWords(rosterNames);
  const words = without(contentWords(probe.text), cast);
  const player = contentWords(playerText);
  if (restatesWords(words, player) || sharedCount(words, player) >= RAISE_MIN_SHARED) return true;
  const topical = [...probe.entities, ...probe.triggers].map((term) => term.trim()).filter((term) => term.length >= 3 && !cast.has(term.toLowerCase()));
  return topical.some((term) => termPresent(playerText, term));
}

export function heldForMember(state: MentionsState, member: string, boundary: number, raised: (id: string) => boolean, hold = MENTION_HOLD_BOUNDARIES): Set<string> {
  const recent = state.records.filter((record) => record.kind === "row" && record.member === member && boundary - record.boundary < hold && boundary >= record.boundary);
  return new Set(recent.map((record) => record.id).filter((id) => !raised(id)));
}
