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
