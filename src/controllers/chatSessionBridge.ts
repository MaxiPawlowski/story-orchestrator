import { PLAYER_SPEAKER_ID } from "@constants/main";
import { getCharacterNameById, getContext, subscribeToHostEvent } from "@services/STAPI";
import type { EventHandler } from "@services/stHost/events";
import { isNonArrayObject } from "@utils/dataHelpers";
import { normalizeName } from "@utils/string";

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
const hostListeners: Array<() => void> = [];

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

const emit = (event: ChatSessionBridgeEvent) => {
  Array.from(listeners).forEach((listener) => {
    try {
      listener(event);
    } catch (err) {
      console.warn("[Story - ChatSessionBridge] listener failed", err);
    }
  });
};

// ---------------------------------------------------------------------------
// Host-event payload parsers
//
// Each parser maps a raw ST event payload to a typed result.
// Defensive handling for inconsistent host payloads is isolated here;
// all downstream code consumes the typed return values.
// ---------------------------------------------------------------------------

const readString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const readOptionalString = (value: unknown): string | null =>
  typeof value === "string" ? (value.trim() || null) : null;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  isNonArrayObject(value) ? value : null;

const firstValue = (value: unknown): unknown =>
  Array.isArray(value) ? value[0] : value;

export const parseChatContextPayload = (): ChatSessionContextSnapshot => {
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

export const parseDraftedSpeakerPayload = (payload: unknown): string | null => {
  const chid = firstValue(payload);
  const idNum = Number.parseInt(String(chid), 10);
  if (Number.isFinite(idNum)) return getCharacterNameById(idNum) ?? null;
  return readOptionalString(asRecord(payload)?.name);
};

export const parseUserMessagePayload = (...args: unknown[]): ChatSessionUserMessageEvent | null => {
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

export const pickUserTextFromChat = (): ChatSessionUserMessageEvent | null => {
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

export const parseReceivedMessagePayload = (messageId: number, messageType?: string): ChatSessionReceivedMessageEvent | null => {
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

export interface GenerationStartedFields {
  type: string | null;
  dryRun: boolean;
  speakerCandidate: string | null;
}

export const parseGenerationStartedPayload = (args: unknown[], draftedSpeakerName: string | null): GenerationStartedFields => {
  const [firstArg, secondArg, thirdArg, fourthArg] = args;
  const firstRecord = asRecord(firstArg);
  const secondRecord = asRecord(secondArg);
  const type = typeof firstArg === "string" ? firstArg : readOptionalString(firstRecord?.type);
  const dryRun = typeof thirdArg === "boolean" ? thirdArg : Boolean(secondRecord?.dryRun);
  const payload = asRecord(firstValue(fourthArg ?? firstRecord));
  const speakerCandidate = (
    draftedSpeakerName
    ?? readOptionalString(payload?.character)
    ?? readOptionalString(payload?.quietName)
  );
  return { type, dryRun, speakerCandidate };
};

export const parseMessageReceivedArgs = (args: unknown[]): { messageId: number; messageType: string | undefined } => ({
  messageId: Number(args[0]),
  messageType: typeof args[1] === "string" ? args[1] : undefined,
});

// ---------------------------------------------------------------------------
// Bridge event emitters and host-event handlers
// ---------------------------------------------------------------------------

const emitChatSnapshot = (force = false) => {
  const nextChat = parseChatContextPayload();
  const prevChat = snapshot.chat;
  if (!force && prevChat.chatId === nextChat.chatId && prevChat.groupChatSelected === nextChat.groupChatSelected) {
    return;
  }
  snapshot = { ...snapshot, chat: nextChat };
  emit({ type: "chat", chat: nextChat });
};

const setGenerationSnapshot = (
  next: Partial<ChatSessionGenerationSnapshot>,
  eventType: "generation-drafted" | "generation-started" | "generation-stopped" | "generation-ended",
) => {
  snapshot = {
    ...snapshot,
    generation: { ...snapshot.generation, ...next },
  };
  emit({ type: eventType, generation: snapshot.generation });
};

const publishUserMessage = (...args: unknown[]) => {
  const message = parseUserMessagePayload(...args) ?? pickUserTextFromChat();
  if (!message) return false;
  emit({ type: "user-message", message });
  return true;
};

const handleUserMessage: EventHandler = (...args) => {
  if (publishUserMessage(...args)) return;
  setTimeout(() => { publishUserMessage(...args); }, 0);
};

const handleDrafted: EventHandler = (payload) => {
  setGenerationSnapshot({ draftedSpeakerName: parseDraftedSpeakerPayload(payload) }, "generation-drafted");
};

const handleGenerationStarted: EventHandler = (...args) => {
  const { type, dryRun, speakerCandidate } = parseGenerationStartedPayload(args, snapshot.generation.draftedSpeakerName);
  setGenerationSnapshot({ active: true, type, dryRun, speakerName: speakerCandidate }, "generation-started");
};

const handleGenerationStopped: EventHandler = () => {
  setGenerationSnapshot({ active: false }, "generation-stopped");
};

const handleGenerationEnded: EventHandler = () => {
  setGenerationSnapshot({ active: false, type: null, dryRun: false, speakerName: null, draftedSpeakerName: null }, "generation-ended");
};

const handleMessageReceived: EventHandler = (...args) => {
  const { messageId, messageType } = parseMessageReceivedArgs(args);
  const message = parseReceivedMessagePayload(messageId, messageType);
  if (message) emit({ type: "message-received", message });
};

// ---------------------------------------------------------------------------
// Host subscription management
// ---------------------------------------------------------------------------

const addHostListener = (eventName: string | undefined, handler: EventHandler) => {
  if (!eventName) return;
  hostListeners.push(subscribeToHostEvent(eventName, handler));
};

const addHostListeners = (eventNames: Array<string | undefined>, handler: EventHandler) => {
  for (const eventName of eventNames) addHostListener(eventName, handler);
};

const cleanupHostListeners = () => {
  while (hostListeners.length) {
    const off = hostListeners.pop();
    try { off?.(); } catch (err) {
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
  ], () => { emitChatSnapshot(); });

  addHostListener(eventTypes.MESSAGE_SENT, handleUserMessage);
  addHostListener(eventTypes.MESSAGE_RECEIVED, handleMessageReceived);
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
      chat: parseChatContextPayload(),
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
