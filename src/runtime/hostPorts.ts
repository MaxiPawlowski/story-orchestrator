import type * as Stapi from "@services/STAPI";
import type { SharedReadWindow } from "@extraction/types";

export type PlayerHost = Pick<typeof Stapi, "getPlayerName">;

export type PromptHost = Pick<typeof Stapi, "setStoryExtensionPrompt" | "clearStoryExtensionPrompt">;

export interface ChatHost {
  chatWindow: (from: number, to?: number) => SharedReadWindow;
  lastMessageText: () => string;
  chatRows: () => unknown[];
  chatId: () => string | null;
}

export type RosterHost = Pick<typeof Stapi, "getActiveGroup" | "resolveGroupMemberId"> & {
  chatRows: () => unknown[];
  systemUserName: string;
};
