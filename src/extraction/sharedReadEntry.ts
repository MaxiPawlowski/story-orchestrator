import type { TokenCounter } from "./inputBudget";
import { PLAYER_MARK } from "./question";
import type { RunSharedReadOptions } from "./sharedRead";
import { READ_LAYOUTS, type ChatMessageWindowEntry, type ChatWindowReader, type ReadLayout, type ReadPromptOptions, type SharedReadResult, type SharedReadWindow } from "./types";

const noReader: ChatWindowReader = () => { throw new Error("a shared read needs a window or a chat reader"); };

export function sharedReadWindow(options: Pick<RunSharedReadOptions, "state" | "priority" | "window" | "stabilityLag" | "readWindow">): SharedReadWindow {
  const latestMessageId = options.state.lastMessageId - (options.priority === 1 ? Math.max(0, options.stabilityLag ?? 1) : 0);
  return options.window ?? (options.readWindow ?? noReader)(Math.max(0, latestMessageId - 7), latestMessageId);
}

export const transcriptPrefixCost = (messages: readonly ChatMessageWindowEntry[], count: TokenCounter): number =>
  messages.reduce((top, message) => Math.max(top, count(`[${message.index}] ${message.speaker}${message.isUser ? PLAYER_MARK : ""}: \n`)), 0);

export const isReadLayout = (value: unknown): value is ReadLayout => (READ_LAYOUTS as readonly unknown[]).includes(value);

export const sanitizeReadPrompt = (settings: { readLayout?: unknown; promiseAddressee?: unknown }): ReadPromptOptions => ({
  ...(isReadLayout(settings.readLayout) ? { readLayout: settings.readLayout } : {}),
  ...(settings.promiseAddressee === true ? { promiseAddressee: true } : {}),
});

export const readPromptOptions = (settings: ReadPromptOptions): { readPrompt?: ReadPromptOptions } => {
  const readPrompt = sanitizeReadPrompt(settings);
  return Object.keys(readPrompt).length ? { readPrompt } : {};
};

export const runSharedRead = async (options: RunSharedReadOptions): Promise<SharedReadResult> => (await import("./sharedRead")).runSharedRead(options);
