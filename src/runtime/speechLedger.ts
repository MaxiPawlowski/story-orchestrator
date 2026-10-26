import type { SourceRevision } from "@memory/audience";

export const SPEECH_ORIGINS = ["chain", "npc", "entry", "spotlight", "address", "reaction"] as const;
export type SpeechOrigin = (typeof SPEECH_ORIGINS)[number];

export interface SpeechRequest {
  origin: SpeechOrigin;
  member: string;
  generated: boolean;
  source: { messageId: number; revision: SourceRevision | null };
  entry: string;
  recipient: string;
  instruction: string | null;
  yieldAfter: boolean;
  cause?: string;
}

export interface SpeechReservation {
  id: number;
  send: number;
  request: SpeechRequest;
}

export interface SpeechEvent {
  send: number;
  origin: SpeechOrigin;
  member: string;
  generated: boolean;
  entry: string;
  recipient: string;
  instructed: boolean;
  yieldAfter: boolean;
  at: number;
  messageId: number | null;
  revision?: SourceRevision;
  cause?: string;
  words?: number;
}

export const SPEECH_EVENT_LIMIT = 200;

export const recordSpeechEvent = (events: SpeechEvent[] | undefined, event: SpeechEvent): SpeechEvent[] => [...(events ?? []), event].slice(-SPEECH_EVENT_LIMIT);

const shift = (id: number, from: number, removed: number) => (id >= from + removed ? id - removed : id);

export const rewindSpeech = (events: SpeechEvent[] | undefined, messageId: number, mutation?: { kind: "edit" | "delete" | "swipe"; removed?: number }): SpeechEvent[] => {
  const removed = Math.max(1, mutation?.removed ?? 1);
  const gone = (id: number) => id >= messageId && id < messageId + removed;
  return (events ?? []).flatMap((event) => {
    if (event.at < messageId && (event.messageId === null || event.messageId < messageId)) return [event];
    if (!mutation) return [];
    if (mutation.kind !== "delete") return event.at < messageId && event.messageId === messageId ? [event] : [];
    if (gone(event.send) || (event.messageId !== null && gone(event.messageId))) return [];
    return [{
      ...event,
      send: shift(event.send, messageId, removed),
      at: event.at >= messageId + removed ? event.at - removed : Math.min(event.at, messageId - 1),
      messageId: event.messageId === null ? null : shift(event.messageId, messageId, removed),
    }];
  });
};

const isRevision = (value: unknown): value is SourceRevision => Boolean(value) && typeof value === "object"
  && typeof (value as SourceRevision).hash === "string" && ((value as SourceRevision).swipeId === null || Number.isInteger((value as SourceRevision).swipeId));

const isSpeechEvent = (value: unknown): value is SpeechEvent => {
  if (!value || typeof value !== "object") return false;
  const event = value as SpeechEvent;
  return (SPEECH_ORIGINS as readonly string[]).includes(event.origin) && Number.isInteger(event.send) && Number.isInteger(event.at)
    && (event.messageId === null || Number.isInteger(event.messageId)) && typeof event.member === "string" && typeof event.entry === "string"
    && typeof event.recipient === "string" && typeof event.generated === "boolean" && typeof event.instructed === "boolean" && typeof event.yieldAfter === "boolean"
    && (event.revision === undefined || isRevision(event.revision));
};

export const sanitizeSpeech = (value: unknown): SpeechEvent[] => (Array.isArray(value) ? value : []).filter(isSpeechEvent).slice(-SPEECH_EVENT_LIMIT);
