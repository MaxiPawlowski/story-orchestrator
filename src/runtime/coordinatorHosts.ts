import {
  activateGlobalLorebook, clearStoryExtensionPrompt, createCharacterCard, createGroup, createLorebook, getActiveGroup, getAllCharacterNames,
  getContext, getPlayerName, hostSystemUserName, listAllLorebooks, listGlobalLorebooks, listGroupNames, readWIEntry, resolveGroupMemberId,
  setStoryExtensionPrompt, upsertWIEntry,
} from "@services/STAPI";
import { getChatWindow, getLastMessageText } from "@extraction/chatWindow";
import type { ChatHost, PlayerHost, PromptHost, ProvisioningHost, RosterHost } from "./hostPorts";

const chatRows = (): unknown[] => (Array.isArray(getContext().chat) ? getContext().chat : []);

const promptHost: PromptHost = { setStoryExtensionPrompt, clearStoryExtensionPrompt };

const chatHost: ChatHost = {
  chatWindow: getChatWindow,
  lastMessageText: getLastMessageText,
  chatRows,
  chatId: () => getContext().chatId ?? null,
};

const rosterHost: RosterHost = { getActiveGroup, resolveGroupMemberId, chatRows, systemUserName: hostSystemUserName };

const playerHost: PlayerHost = { getPlayerName };

const provisioningHost: ProvisioningHost = {
  activateGlobalLorebook, createCharacterCard, createGroup, createLorebook, getAllCharacterNames, listAllLorebooks, listGlobalLorebooks,
  listGroupNames, readWIEntry, upsertWIEntry,
};

export const coordinatorHosts = { prompt: promptHost, player: playerHost, provisioning: provisioningHost, chat: chatHost, roster: rosterHost };
