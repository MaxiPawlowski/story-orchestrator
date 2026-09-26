import {
  clearStoryExtensionPrompt, getActiveGroup, getContext, getPlayerName, hostSystemUserName, resolveGroupMemberId, setStoryExtensionPrompt,
} from "@services/STAPI";
import { getChatWindow, getLastMessageText } from "@extraction/chatWindow";
import type { ChatHost, PlayerHost, PromptHost, RosterHost } from "./hostPorts";

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

export const coordinatorHosts = { prompt: promptHost, player: playerHost, chat: chatHost, roster: rosterHost };
