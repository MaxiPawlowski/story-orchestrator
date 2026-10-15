import type { SourceSpan } from "../audience";

export const PROMISE_EVENT_KINDS = ["kept", "broken", "renegotiated", "released"] as const;
export type PromiseEventKind = (typeof PROMISE_EVENT_KINDS)[number];
export type PromiseLineKind = "promised" | PromiseEventKind;
export type PromiseStatus = "open" | "kept" | "broken" | "released";

export const PROMISE_OPEN_CAP = 24;
export const PROMISE_COOLDOWN_TURNS = 15;
export const PROMISE_TRIGGER_SURFACINGS = 3;

export interface PromiseDeadline {
  text: string;
  source: SourceSpan;
  dueDay?: number;
}

export interface PromiseEvent {
  eventId: string;
  kind: PromiseEventKind;
  quote: string;
  source: SourceSpan;
  at: { boundary: number };
}

export interface PromiseRow {
  id: string;
  promisee: string;
  quote: string;
  source: SourceSpan;
  madeAt: { boundary: number };
  events: PromiseEvent[];
  deadline?: PromiseDeadline;
  conditional?: true;
  questId?: string;
}

export interface PromisesState {
  rows: PromiseRow[];
}

export interface ParsedPromiseLine {
  kind: PromiseLineKind;
  target: string;
  messageId: number;
  quote: string;
  deadline?: string;
  line: string;
}

export interface OpenPromiseRef {
  id: string;
  promisee: string;
  quote: string;
}

export interface PlayerPromise {
  id: string;
  promisee: string;
  quote: string;
  deadline?: string;
  questTitle?: string;
}

export type QuestStatusOf = (questId: string) => "hidden" | "offered" | "active" | "done" | "failed" | null;
