import { PLAYER_SPEAKER_ID } from "@constants/main";
import { getCharacterNameById, getContext } from "@services/STAPI";
import { normalizeName } from "@utils/string";
import { subscribeToEventSource } from "@utils/event-source";

interface ListenerDisposer {
  (): void;
}

export interface ChatSessionContextSnapshot {
  chatId: string | null;
  groupChatSelected: boolean;
}

export interface ChatSessionGenerationSnapshot {
  active: boolean;
  type: string | null;
  dryRun: boolean;
  speakerName: string | null;
  draftedSpeakerName: string | null;
}

export interface ChatSessionUserMessageEvent {
  text: string;
  key: string;
}

export interface ChatSessionReceivedMessageEvent {
  messageId: number;
  messageType?: string;
  speakerName: string;
  speakerId: string;
  isUser: boolean;
  isSystem: boolean;
  isSelfDispatched: boolean;
}

export interface ChatSessionBridgeSnapshot {
  chat: ChatSessionContextSnapshot;
  generation: ChatSessionGenerationSnapshot;
}

export type ChatSessionBridgeEvent =
  | { type: "chat"; chat: ChatSessionContextSnapshot }
  | { type: "user-message"; message: ChatSessionUserMessageEvent }
  | { type: "message-received"; message: ChatSessionReceivedMessageEvent }
  | { type: "generation-drafted"; generation: ChatSessionGenerationSnapshot }
  | { type: "generation-started"; generation: ChatSessionGenerationSnapshot }
  | { type: "generation-stopped"; generation: ChatSessionGenerationSnapshot }
  | { type: "generation-ended"; generation: ChatSessionGenerationSnapshot };

export type ChatSessionBridgeListener = (event: ChatSessionBridgeEvent) => void;

const listeners = new Set<ChatSessionBridgeListener>();
const hostListeners: ListenerDisposer[] = [];

let retainCount = 0;
let started = false;
const createInitialSnapshot = (): ChatSessionBridgeSnapshot => ({
  chat: {
    chatId: null,
    groupChatSelected: false,
  },
  generation: {
    active: false,
    type: null,
    dryRun: false,
    speakerName: null,
    draftedSpeakerName: null,
  },
});

let snapshot: ChatSessionBridgeSnapshot = createInitialSnapshot();

const asRecord = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === "object" ? value as Record<string, unknown> : null
);

const firstValue = (value: unknown) => Array.isArray(value) ? value[0] : value;

const readString = (value: unknown) => typeof value === "string" ? value.trim() : "";

const emit = (event: ChatSessionBridgeEvent) => {
  Array.from(listeners).forEach((listener) => {
    try {
      listener(event);
    } catch (err) {
      console.warn("[Story - ChatSessionBridge] listener failed", err);
    }
  });
};

const readChatSnapshot = (): ChatSessionContextSnapshot => {
  try {
    const { chatId, groupId } = getContext();
    return {
      chatId: chatId == null ? null : (String(chatId).trim() || null),
      groupChatSelected: Boolean(groupId),
    };
  } catch (err) {
    console.warn("[Story - ChatSessionBridge] failed to read chat snapshot", err);
    return { chatId: null, groupChatSelected: false };
  }
};

const readDraftedSpeakerName = (payload: unknown): string | null => {
  const chid = firstValue(payload);
  const idNum = Number.parseInt(String(chid), 10);
  if (Number.isFinite(idNum)) return getCharacterNameById(idNum) ?? null;
  return readString(asRecord(payload)?.name) || null;
};

const pickUserTextFromChat = (): ChatSessionUserMessageEvent | null => {
  const { chat } = getContext();
  for (let i = chat.length - 1; i >= 0; i -= 1) {
    const message = chat[i];
    if (!message?.is_user) continue;
    const text = readString(message.mes);
    if (!text) continue;
    const mesId = message.mesId ?? message.id;
    const key = mesId != null ? `id:${mesId}` : `idx:${i}`;
    return { text, key };
  }
  return null;
};

const readUserMessageFromPayload = (...args: unknown[]): ChatSessionUserMessageEvent | null => {
  const record = asRecord(args.find((value) => value != null));
  if (!record) return null;
  const text = readString(record.mes) || readString(record.text);
  if (!text) return null;

  const messageId = record.mesId ?? record.id;
  return {
    text,
    key: messageId != null ? `id:${messageId}` : `text:${text.toLowerCase()}`,
  };
};

const readReceivedMessage = (messageId: number, messageType?: string): ChatSessionReceivedMessageEvent | null => {
  const { chat } = getContext();
  const message = chat[messageId];
  if (!message) return null;
  const isUser = Boolean(message.is_user);
  const speakerName = isUser ? PLAYER_SPEAKER_ID : (message.name ?? "");
  return {
    messageId,
    messageType,
    speakerName,
    speakerId: isUser ? PLAYER_SPEAKER_ID : normalizeName(speakerName),
    isUser,
    isSystem: Boolean(message.is_system),
    isSelfDispatched: Boolean(message?.extra?.storyOrchestratorTalkControl),
  };
};

const emitChatSnapshot = (force = false) => {
  const nextChat = readChatSnapshot();
  const prevChat = snapshot.chat;
  if (!force && prevChat.chatId === nextChat.chatId && prevChat.groupChatSelected === nextChat.groupChatSelected) {
    return;
  }
  snapshot = {
    ...snapshot,
    chat: nextChat,
  };
  emit({ type: "chat", chat: nextChat });
};

const setGenerationSnapshot = (
  next: Partial<ChatSessionGenerationSnapshot>,
  eventType: "generation-drafted" | "generation-started" | "generation-stopped" | "generation-ended",
) => {
  snapshot = {
    ...snapshot,
    generation: {
      ...snapshot.generation,
      ...next,
    },
  };
  emit({ type: eventType, generation: snapshot.generation });
};

const publishUserMessage = (...args: unknown[]) => {
  const message = readUserMessageFromPayload(...args) ?? pickUserTextFromChat();
  if (!message) return false;
  emit({ type: "user-message", message });
  return true;
};

const handleUserMessage = (...args: unknown[]) => {
  if (publishUserMessage(...args)) return;

  // ST can emit MESSAGE_SENT before the new chat entry is visible in getContext().chat.
  setTimeout(() => {
    publishUserMessage(...args);
  }, 0);
};

const handleDrafted = (payload: unknown) => {
  setGenerationSnapshot({ draftedSpeakerName: readDraftedSpeakerName(payload) }, "generation-drafted");
};

const handleGenerationStarted = (...args: unknown[]) => {
  const [firstArg, secondArg, thirdArg, fourthArg] = args;
  const firstRecord = asRecord(firstArg);
  const secondRecord = asRecord(secondArg);
  const type = typeof firstArg === "string" ? firstArg : readString(firstRecord?.type) || null;
  const dryRun = typeof thirdArg === "boolean" ? thirdArg : Boolean(secondRecord?.dryRun);
  const payload = asRecord(firstValue(fourthArg ?? firstRecord));
  const candidate = (
    snapshot.generation.draftedSpeakerName
    ?? readString(payload?.character)
    ?? readString(payload?.quietName)
  ) || null;
  setGenerationSnapshot({ active: true, type, dryRun, speakerName: candidate }, "generation-started");
};

const handleGenerationStopped = () => {
  setGenerationSnapshot({ active: false }, "generation-stopped");
};

const handleGenerationEnded = () => {
  setGenerationSnapshot({ active: false, type: null, dryRun: false, speakerName: null, draftedSpeakerName: null }, "generation-ended");
};

const handleMessageReceived = (messageId: number, messageType?: string) => {
  const message = readReceivedMessage(messageId, messageType);
  if (!message) return;
  emit({ type: "message-received", message });
};

const addHostListener = (eventName: string | undefined, handler: (...args: unknown[]) => void) => {
  if (!eventName) return;
  const { eventSource } = getContext();
  hostListeners.push(subscribeToEventSource({
    source: eventSource,
    eventName,
    handler,
  }));
};

const addHostListeners = (eventNames: Array<string | undefined>, handler: (...args: unknown[]) => void) => {
  eventNames.forEach((eventName) => {
    addHostListener(eventName, handler);
  });
};

const cleanupHostListeners = () => {
  while (hostListeners.length) {
    const off = hostListeners.pop();
    try {
      off?.();
    } catch (err) {
      console.warn("[Story - ChatSessionBridge] unsubscribe failed", err);
    }
  }
  started = false;
};

const ensureStarted = () => {
  if (started) return;
  const { eventTypes } = getContext();
  started = true;

  addHostListeners([
    eventTypes.CHAT_CHANGED,
    eventTypes.CHAT_CREATED,
    eventTypes.GROUP_CHAT_CREATED,
    eventTypes.CHAT_DELETED,
    eventTypes.GROUP_CHAT_DELETED,
  ], () => {
    emitChatSnapshot();
  });
  addHostListener(eventTypes.MESSAGE_SENT, handleUserMessage);
  addHostListener(eventTypes.MESSAGE_RECEIVED, (...args) => {
    handleMessageReceived(Number(args[0]), typeof args[1] === "string" ? args[1] : undefined);
  });
  addHostListener(eventTypes.GROUP_MEMBER_DRAFTED, handleDrafted);
  addHostListener(eventTypes.GENERATION_STARTED, handleGenerationStarted);
  addHostListener(eventTypes.GENERATION_STOPPED, handleGenerationStopped);
  addHostListener(eventTypes.GENERATION_ENDED, handleGenerationEnded);

  emitChatSnapshot(true);
};

export const retainChatSessionBridge = () => {
  retainCount += 1;
  ensureStarted();
};

export const releaseChatSessionBridge = () => {
  retainCount = Math.max(0, retainCount - 1);
  if (retainCount > 0) return;
  cleanupHostListeners();
};

export const subscribeToChatSessionBridge = (listener: ChatSessionBridgeListener) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const getChatSessionBridgeSnapshot = (): ChatSessionBridgeSnapshot => {
  if (!started) {
    snapshot = {
      ...snapshot,
      chat: readChatSnapshot(),
    };
  }
  return snapshot;
};

export const resetChatSessionBridgeForTests = () => {
  listeners.clear();
  retainCount = 0;
  snapshot = createInitialSnapshot();
  cleanupHostListeners();
};
