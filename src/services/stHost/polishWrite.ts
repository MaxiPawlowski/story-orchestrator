import { getContext } from "./context";
import { isRecord } from "@utils/guards";
import { couldNot, wrote, type WriteResult } from "@utils/writeResult";

export function polishReplyText(messageId: number, row: unknown, mes: string): WriteResult {
  const context = getContext();
  const message = context?.chat?.[messageId];
  if (!isRecord(message) || message !== row || typeof message.mes !== "string") return couldNot("the reply is no longer the row the polish read");
  message.mes = mes;
  const swipe = message.swipe_id;
  if (typeof swipe === "number" && Array.isArray(message.swipes) && typeof message.swipes[swipe] === "string") message.swipes[swipe] = mes;
  context.updateMessageBlock?.(messageId, message);
  return wrote();
}
