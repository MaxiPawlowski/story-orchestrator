import { isRecord } from "@utils/guards";
import type { FoldDecision } from "../turnBridge";

const isToolInvocation = (message: unknown): boolean =>
  isRecord(message) && message.is_system === true && isRecord(message.extra) && Array.isArray(message.extra.tool_invocations);

export const toolTurnVerdict = (current: number | null, next: number | null, chat: readonly unknown[]): FoldDecision => {
  if (current === null || (next !== null && next <= current)) return "commit";
  const between = chat.slice(current + 1, next ?? chat.length);
  if (between.length === 0 || !between.every(isToolInvocation)) return "commit";
  return next === null ? "hold" : "fold";
};
