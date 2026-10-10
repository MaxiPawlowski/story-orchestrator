import {
  bindChatLorebook, capabilityState, clearStoryExtensionPrompt, countTokens,
  createCharacterCard, createGroup, createLorebook, currentChatOwner, DEFAULT_VECTOR_SOURCE, disableWIEntry,
  ensureLorebook, getActiveGroup, getAllCharacterNames, getCharacterNameById, getContext, getPlayerName,
  hostSystemUserName, listAllLorebooks, listGlobalLorebooks, listGroupCasts, listGroupNames, listPersonas, loadLorebook, readInjectedPromptBlocks,
  readWIEntry, readWIEntryAt, resolveGroupMemberId, restoreWIEntryAt, setStoryExtensionPrompt, unbindChatLorebook, updateWIEntryByUid, createWIEntry, deleteWIEntryAt,
  upsertWIEntry, vectorInsert, vectorPurge, vectorQuery,
} from "@services/STAPI";
import { getChatWindow, getLastMessageText } from "@extraction/chatWindow";
import { scanningPromptHost } from "./scanMemory";
import { getGlobalSettings } from "./settingsStore";
import { scanGatingActive } from "./worldInfoMode";
import { yieldingVectorHost, type VectorQuiet } from "./vectorYield";
import type {
  ChatHost, CuratorWiHost, InjectionHost, MirrorHost, PlayerHost, PromptHost, ProvisioningHost, RosterHost, TokenHost, VectorHost,
} from "./hostPorts";

const chatRows = (): unknown[] => (Array.isArray(getContext().chat) ? getContext().chat : []);

const promptHost: PromptHost = scanningPromptHost({ setStoryExtensionPrompt, clearStoryExtensionPrompt }, () => getGlobalSettings().worldInfo.scanMemory);

const chatHost: ChatHost = {
  chatWindow: getChatWindow,
  lastMessageText: getLastMessageText,
  chatRows,
  chatId: () => getContext().chatId ?? null,
};

const rosterHost: RosterHost = { getActiveGroup, resolveGroupMemberId, chatRows, systemUserName: hostSystemUserName };

const playerHost: PlayerHost = { getPlayerName };

const curatorHost: CuratorWiHost = { readWIEntry, readWIEntryAt, restoreWIEntryAt, updateWIEntryByUid, loadLorebook, createWIEntry, deleteWIEntryAt };

const provisioningHost: ProvisioningHost = {
  createCharacterCard, createGroup, createLorebook, getAllCharacterNames, listAllLorebooks, listGlobalLorebooks,
  listGroupCasts, listGroupNames, listPersonas, readWIEntry, upsertWIEntry,
};

const injectionHost: InjectionHost = { readInjectedPromptBlocks, getCharacterNameById };

let vectorQuiet: VectorQuiet | null = null;

export const quietVectorsFor = (quiet: VectorQuiet | null) => {
  vectorQuiet = quiet;
};

const vectorHost: VectorHost = yieldingVectorHost({ vectorQuery, vectorInsert, vectorPurge, capabilityState, source: DEFAULT_VECTOR_SOURCE }, () => vectorQuiet);

const tokenHost: TokenHost = { countTokens };

const mirrorHost: MirrorHost = {
  ensureLorebook, loadLorebook, upsertWIEntry, disableWIEntry, bindChatLorebook, owner: currentChatOwner, scanActive: scanGatingActive, unbindChatLorebook,
};

export const coordinatorHosts = {
  prompt: promptHost, player: playerHost, provisioning: provisioningHost, curator: curatorHost, chat: chatHost, roster: rosterHost,
  injection: injectionHost, vectors: vectorHost, tokens: tokenHost, mirror: mirrorHost,
};
