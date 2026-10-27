import type { BoundaryLogEntry } from "@engine/index";
import { latestSend, speechRows } from "@talk/index";

const CONSEQUENTIAL_KEY = /^(?:quest_.+_(?:closed|rewarded)|check_.+_rolled)$/;

export const consequential = (entry: Pick<BoundaryLogEntry, "fired" | "before" | "after">): boolean => {
  if (entry.fired) return true;
  const before = entry.before.blackboard.values;
  const after = entry.after.blackboard.values;
  return Object.keys(after).some((key) => CONSEQUENTIAL_KEY.test(key) && after[key] !== before[key]);
};

export const consequenceSince = (log: readonly BoundaryLogEntry[], chat: readonly unknown[]): string | null => {
  const send = latestSend(speechRows(chat));
  if (send < 0) return null;
  for (let index = log.length - 1; index >= 0; index -= 1) {
    const entry = log[index];
    if (entry.context.lastMessageId < send) return null;
    if (consequential(entry)) return `${entry.boundary}@${entry.context.lastMessageId}`;
  }
  return null;
};
