// NPC reply fire counts are keyed by checkpoint/trigger/member/index, so a rollback has no message
// to compare against. Recording the message id each fire happened at lets a rollback past that id
// re-arm the reply instead of silently skipping it on the replay.

export const recordNpcReplyFire = (counts: Record<string, number>, at: Record<string, number[]>, key: string, messageId: number): void => {
  counts[key] = (counts[key] ?? 0) + 1;
  at[key] = [...(at[key] ?? []), messageId];
};

export const NPC_REPLY_SPACING = 8;

export type ActiveTrigger = "afterSpeak" | "sceneBreak";

export const heldLine = (replies: Array<{ trigger: string; enabled?: boolean }>, trigger: ActiveTrigger, checkpoint: string, leaving: string): [string, string] | null =>
  replies.some((reply) => reply.trigger === trigger && reply.enabled !== false)
    ? [`a ${trigger} line of ${checkpoint} was held`, `the writes queued for the next boundary move the story to ${leaving}, so the line would land in the next scene`]
    : null;

export const npcReplyMayFire = (
  counts: Record<string, number>, at: Record<string, number[]> | undefined, key: string, maxTriggers: number | undefined, trigger: string, messageId: number,
): boolean => {
  if ((counts[key] ?? 0) >= Math.max(1, maxTriggers ?? 1)) return false;
  const last = at?.[key]?.at(-1);
  return trigger === "onEnter" || last === undefined || messageId - last >= NPC_REPLY_SPACING;
};

const lineGone = (line: number, messageId: number, mutation: PostMutation): boolean =>
  mutation.kind === "delete" ? line >= messageId && line < messageId + removedBy(mutation) : mutation.kind === "swipe" && line === messageId;

const rewoundFire = (id: number, messageId: number, mutation?: PostMutation): number | null => {
  if (!mutation) return id < messageId ? id : null;
  const line = id + 1;
  if (line < messageId) return id;
  if (lineGone(line, messageId, mutation)) return null;
  return mutation.kind === "delete" ? id - removedBy(mutation) : id;
};

export const rewindNpcReplies = (counts: Record<string, number>, at: Record<string, number[]>, messageId: number, mutation?: PostMutation): void => {
  for (const key of Object.keys(at)) {
    const ids = at[key];
    const kept = ids.map((id) => rewoundFire(id, messageId, mutation)).filter((id): id is number => id !== null);
    if (kept.length === ids.length) {
      at[key] = kept;
      continue;
    }
    const removed = ids.length - kept.length;
    const next = (counts[key] ?? 0) - removed;
    if (next > 0) counts[key] = next;
    else delete counts[key];
    if (kept.length) at[key] = kept;
    else delete at[key];
  }
};

export interface OnEnterPost {
  checkpointId: string;
  gate: number;
  first: number;
  last: number;
}

export const ON_ENTER_POST_LIMIT = 20;

export const recordOnEnterPost = (posts: OnEnterPost[], post: OnEnterPost): OnEnterPost[] =>
  [...posts.filter((entry) => entry.first < post.first), post].slice(-ON_ENTER_POST_LIMIT);

export interface PostMutation {
  kind: "edit" | "delete" | "swipe";
  removed?: number;
}

const removedBy = (mutation: PostMutation): number => Math.max(1, mutation.removed ?? 1);

const untouchedFrom = (messageId: number, mutation: PostMutation): number => messageId + (mutation.kind === "delete" ? removedBy(mutation) : 1);

export const survivingOnEnterPosts = (posts: OnEnterPost[] | undefined, messageId: number, mutation?: PostMutation): OnEnterPost[] => {
  if (!mutation) return [];
  const from = untouchedFrom(messageId, mutation);
  const shift = mutation.kind === "delete" ? removedBy(mutation) : 0;
  return (posts ?? []).filter((post) => post.last >= messageId && post.first >= from).map((post) => ({
    checkpointId: post.checkpointId,
    gate: post.gate >= from ? post.gate - shift : shift && post.gate >= messageId ? messageId - 1 : post.gate,
    first: post.first - shift,
    last: post.last - shift,
  }));
};

export const rewindOnEnterPosts = (posts: OnEnterPost[] | undefined, messageId: number, mutation?: PostMutation): OnEnterPost[] =>
  [...(posts ?? []).filter((post) => post.last < messageId), ...survivingOnEnterPosts(posts, messageId, mutation)];

export const sanitizeOnEnterPosts = (value: unknown): OnEnterPost[] => (Array.isArray(value) ? value : []).filter((entry): entry is OnEnterPost =>
  Boolean(entry) && typeof entry === "object" && typeof (entry as OnEnterPost).checkpointId === "string"
  && [(entry as OnEnterPost).gate, (entry as OnEnterPost).first, (entry as OnEnterPost).last].every(Number.isInteger)
  && (entry as OnEnterPost).gate < (entry as OnEnterPost).first && (entry as OnEnterPost).first <= (entry as OnEnterPost).last).slice(-ON_ENTER_POST_LIMIT);

export interface OnEnterRollback {
  from: number;
  remove: { first: number; last: number };
  summary: string;
  note: string;
}

export function onEnterRollbackPlan(posts: OnEnterPost[] | undefined, kind: "swipe" | "edit" | "delete" | "update", messageId: number, chatLength: number): OnEnterRollback | null {
  for (const post of [...(posts ?? [])].reverse()) {
    if (kind === "delete") {
      if (messageId < post.first || messageId > post.last || post.last < chatLength) continue;
      return {
        from: post.gate, remove: { first: post.first, last: chatLength - 1 },
        summary: `the scene opener of "${post.checkpointId}" was deleted`,
        note: `message ${messageId} was posted by the transition at message ${post.gate}, so the transition is stepped back with it`,
      };
    }
    if (messageId !== post.gate || post.last !== chatLength - 1) continue;
    return {
      from: post.gate, remove: { first: post.first, last: post.last },
      summary: `the reply that opened "${post.checkpointId}" changed`,
      note: `messages ${post.first}-${post.last} were posted by the transition message ${post.gate} made, so they go with it`,
    };
  }
  return null;
}
