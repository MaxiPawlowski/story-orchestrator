import { getContext } from "./context";

export function sendSystemChatMessage(text: string): boolean {
  const context = getContext() as unknown as {
    sendSystemMessage?: (type: string, text?: string, extra?: Record<string, unknown>) => void;
  } | undefined;
  if (typeof context?.sendSystemMessage !== "function") return false;
  context.sendSystemMessage("generic", text);
  return true;
}
