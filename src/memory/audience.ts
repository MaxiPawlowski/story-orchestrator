export interface SourceRevision {
  swipeId: number | null;
  hash: string;
}

export interface SourceSpan {
  chatId: string;
  storyId?: string;
  messageId: number;
  revision: SourceRevision;
  speaker: string;
  isUser: boolean;
  span: [number, number];
  inputRange?: { from: number; to: number };
}

export type SpanAudience = "all-present" | "partial" | "unknown";

export type SpanAudienceOf = (source: SourceSpan) => SpanAudience;

export const unknownAudience: SpanAudienceOf = () => "unknown";

export const isSourceSpan = (value: unknown): value is SourceSpan => {
  if (!value || typeof value !== "object") return false;
  const span = value as Partial<SourceSpan>;
  return typeof span.chatId === "string" && Number.isSafeInteger(span.messageId) && typeof span.speaker === "string" && typeof span.isUser === "boolean"
    && Array.isArray(span.span) && span.span.length === 2 && span.span.every((at) => Number.isSafeInteger(at))
    && Boolean(span.revision) && typeof span.revision?.hash === "string" && (span.revision.swipeId === null || Number.isSafeInteger(span.revision.swipeId));
};

export const AUDIENCE_RELATIONS = ["witnessed", "told", "believed", "player-visible", "authorized-disclosure"] as const;
export type AudienceRelation = (typeof AUDIENCE_RELATIONS)[number];

export type RelationValue = "yes" | "no" | "unknown";

export const WITNESS_STATES = ["classified", "pending", "no-read", "outage", "invalidated", "unknown"] as const;
export type WitnessState = (typeof WITNESS_STATES)[number];

export interface WitnessLookup {
  state: WitnessState;
  heard: RelationValue;
  mixed: boolean;
  insideHeardSpan: boolean;
}

export const unknownWitness = (state: WitnessState = "unknown"): WitnessLookup => ({ state, heard: "unknown", mixed: false, insideHeardSpan: false });

export const sameRevision = (left: SourceRevision, right: SourceRevision | null | undefined): boolean =>
  Boolean(right) && left.hash === right?.hash && left.swipeId === right?.swipeId;
