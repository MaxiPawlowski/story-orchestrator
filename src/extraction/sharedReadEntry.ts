import type { TokenCounter } from "./inputBudget";
import { PLAYER_MARK } from "./question";
import type { RunSharedReadOptions } from "./sharedRead";
import type { ChatMessageWindowEntry, ChatWindowReader, SharedReadResult, SharedReadWindow } from "./types";

const noReader: ChatWindowReader = () => { throw new Error("a shared read needs a window or a chat reader"); };

export function sharedReadWindow(options: Pick<RunSharedReadOptions, "state" | "priority" | "window" | "stabilityLag" | "readWindow">): SharedReadWindow {
  const latestMessageId = options.state.lastMessageId - (options.priority === 1 ? Math.max(0, options.stabilityLag ?? 1) : 0);
  return options.window ?? (options.readWindow ?? noReader)(Math.max(0, latestMessageId - 7), latestMessageId);
}

export const transcriptPrefixCost = (messages: readonly ChatMessageWindowEntry[], count: TokenCounter): number =>
  messages.reduce((top, message) => Math.max(top, count(`[${message.index}] ${message.speaker}${message.isUser ? PLAYER_MARK : ""}: \n`)), 0);

export const runSharedRead = async (options: RunSharedReadOptions): Promise<SharedReadResult> => (await import("./sharedRead")).runSharedRead(options);
