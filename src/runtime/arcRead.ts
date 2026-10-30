import type { ArcRead } from "@memory/index";
import type { ChatHost } from "./hostPorts";

export const arcReadOf = (chat: Pick<ChatHost, "chatId" | "chatWindow">, storyId: string | undefined, window: { from: number; to: number }): ArcRead | undefined => {
  const chatId = chat.chatId();
  return chatId ? { chatId, ...(storyId ? { storyId } : {}), window: chat.chatWindow(window.from, window.to) } : undefined;
};
