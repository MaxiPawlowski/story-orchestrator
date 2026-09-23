import { getContext } from "./context";
import { couldNot, wrote, type WriteResult } from "@utils/writeResult";

export function sendSystemChatMessage(text: string): WriteResult {
  const context = getContext() as unknown as {
    sendSystemMessage?: (type: string, text?: string, extra?: Record<string, unknown>) => void;
  } | undefined;
  if (typeof context?.sendSystemMessage !== "function") return couldNot("this SillyTavern has no system-message API");
  context.sendSystemMessage("generic", text);
  return wrote();
}
