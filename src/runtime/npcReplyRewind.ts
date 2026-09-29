// NPC reply fire counts are keyed by checkpoint/trigger/member/index, so a rollback has no message
// to compare against. Recording the message id each fire happened at lets a rollback past that id
// re-arm the reply instead of silently skipping it on the replay.

export const recordNpcReplyFire = (counts: Record<string, number>, at: Record<string, number[]>, key: string, messageId: number): void => {
  counts[key] = (counts[key] ?? 0) + 1;
  at[key] = [...(at[key] ?? []), messageId];
};

export const rewindNpcReplies = (counts: Record<string, number>, at: Record<string, number[]>, messageId: number): void => {
  for (const key of Object.keys(at)) {
    const ids = at[key];
    const kept = ids.filter((id) => id < messageId);
    if (kept.length === ids.length) continue;
    const removed = ids.length - kept.length;
    const next = (counts[key] ?? 0) - removed;
    if (next > 0) counts[key] = next;
    else delete counts[key];
    if (kept.length) at[key] = kept;
    else delete at[key];
  }
};
