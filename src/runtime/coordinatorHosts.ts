import {
  clearStoryExtensionPrompt, getActiveGroup, getContext, hostSystemUserName, resolveGroupMemberId, setStoryExtensionPrompt,
} from "@services/STAPI";
import { getChatWindow, getLastMessageText } from "@extraction/chatWindow";
import type { ChatHost, PromptHost, RosterHost } from "./hostPorts";

const chatRows = (): unknown[] => (Array.isArray(getContext().chat) ? getContext().chat : []);

const promptHost: PromptHost = { setStoryExtensionPrompt, clearStoryExtensionPrompt };

const chatHost: ChatHost = {
  chatWindow: getChatWindow,
  lastMessageText: getLastMessageText,
  chatRows,
  chatId: () => getContext().chatId ?? null,
};

const rosterHost: RosterHost = { getActiveGroup, resolveGroupMemberId, chatRows, systemUserName: hostSystemUserName };

export const coordinatorHosts = { prompt: promptHost, chat: chatHost, roster: rosterHost };
