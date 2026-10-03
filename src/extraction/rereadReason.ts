export const ROLLBACK_REREAD_PREFIX = "rollback:";

export const rollbackRereadReason = (messageId: number, kind?: string): string => `${ROLLBACK_REREAD_PREFIX}${messageId}${kind ? `:${kind}` : ""}`;
