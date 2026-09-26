import type * as Stapi from "@services/STAPI";
import type { ChatWindowReader } from "@extraction/types";
import type { MemoryMirrorHost } from "./memoryMirror";

export type ProvisioningHost = Pick<typeof Stapi,
  "activateGlobalLorebook" | "createCharacterCard" | "createGroup" | "createLorebook" | "getAllCharacterNames" | "listAllLorebooks" |
  "listGlobalLorebooks" | "listGroupNames" | "readWIEntry" | "upsertWIEntry">;

export type CuratorWiHost = Pick<typeof Stapi,
  "readWIEntry" | "readWIEntryAt" | "restoreWIEntryAt" | "updateWIEntryByUid" | "loadLorebook">;

export type WIEntryTarget = Parameters<CuratorWiHost["readWIEntryAt"]>[0];

export type PlayerHost = Pick<typeof Stapi, "getPlayerName">;

export type PromptHost = Pick<typeof Stapi, "setStoryExtensionPrompt" | "clearStoryExtensionPrompt">;

export interface ChatHost {
  chatWindow: ChatWindowReader;
  lastMessageText: () => string;
  chatRows: () => unknown[];
  chatId: () => string | null;
}

export type RosterHost = Pick<typeof Stapi, "getActiveGroup" | "resolveGroupMemberId"> & {
  chatRows: () => unknown[];
  systemUserName: string;
};

export type InjectionHost = Pick<typeof Stapi, "readInjectedPromptBlocks" | "getCharacterNameById">;

export type VectorHost = Pick<typeof Stapi, "vectorQuery" | "vectorInsert" | "vectorPurge" | "capabilityState"> & { source: string };

export type TokenHost = Pick<typeof Stapi, "countTokens">;

export type MirrorHost = Omit<MemoryMirrorHost, "getChatId" | "ownership">;

export interface InjectorHosts {
  prompt: PromptHost;
  roster: RosterHost;
  chat: Pick<ChatHost, "chatRows" | "lastMessageText">;
  injection: InjectionHost;
}

export interface MemoryHosts extends InjectorHosts {
  chat: ChatHost;
  vectors: VectorHost;
  tokens: TokenHost;
  mirror: MirrorHost;
}
