import { getContext, sendChatJump } from "@services/STAPI";
import { couldNot, wrote, type WriteResult } from "@utils/writeResult";
import { fingerprintAt, jumpTarget, type ChatJumpIndex } from "./messageJump";

export async function jumpToMessage(messageId: number, index: ChatJumpIndex | null): Promise<WriteResult<{ id: number; changed: boolean; bestEffort: boolean }>> {
  const chat = getContext().chat;
  const target = jumpTarget(messageId, Array.isArray(chat) ? chat.length : 0, fingerprintAt(index, messageId));
  if (!target.ok) return couldNot(target.reason);
  const sent = await sendChatJump(target.id);
  return sent.ok ? wrote({ id: target.id, changed: target.changed, bestEffort: target.bestEffort }) : sent;
}
