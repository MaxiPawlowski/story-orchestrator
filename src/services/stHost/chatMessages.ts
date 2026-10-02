import { getContext } from "./context";
import { isRecord } from "@utils/guards";
import { couldNot, wrote, type WriteResult } from "@utils/writeResult";

export interface HostReplyText {
  mes: string;
  reasoning: string;
  isUser: boolean;
}

export function readReplyText(messageId: number): HostReplyText | null {
  const message = getContext()?.chat?.[messageId];
  if (!isRecord(message) || typeof message.mes !== "string") return null;
  const reasoning = isRecord(message.extra) && typeof message.extra.reasoning === "string" ? message.extra.reasoning : "";
  return { mes: message.mes, reasoning, isUser: message.is_user === true };
}

export function rewriteReplyText(messageId: number, text: { mes: string; reasoning: string }): WriteResult {
  const context = getContext();
  const message = context?.chat?.[messageId];
  if (!isRecord(message) || typeof message.mes !== "string") return couldNot("the message is no longer in the open chat");
  message.mes = text.mes;
  message.extra = { ...(isRecord(message.extra) ? message.extra : {}), reasoning: text.reasoning };
  const swipe = message.swipe_id;
  if (typeof swipe === "number" && Array.isArray(message.swipes) && typeof message.swipes[swipe] === "string") message.swipes[swipe] = text.mes;
  const info = typeof swipe === "number" && Array.isArray(message.swipe_info) ? message.swipe_info[swipe] : null;
  if (isRecord(info) && isRecord(info.extra)) info.extra = { ...info.extra, reasoning: text.reasoning };
  context.updateMessageBlock?.(messageId, message);
  return wrote();
}

export function sendSystemChatMessage(text: string): WriteResult {
  const context = getContext() as unknown as {
    sendSystemMessage?: (type: string, text?: string, extra?: Record<string, unknown>) => void;
  } | undefined;
  if (typeof context?.sendSystemMessage !== "function") return couldNot("this SillyTavern has no system-message API");
  context.sendSystemMessage("generic", text);
  return wrote();
}
