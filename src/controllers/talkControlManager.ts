import type { NormalizedStory, NormalizedTalkControl, NormalizedTalkControlCheckpoint, NormalizedTalkControlReply } from "@utils/story-validator";
import { normalizeName } from "@utils/string";
import type { TalkControlTrigger } from "@utils/story-schema";
import { storySessionStore } from "@store/storySessionStore";
import {
  getMessageTimeStamp,
  getCharacterIdByName,
  getContext,
} from "@services/SillyTavernAPI";
import { subscribeToEventSource } from "@utils/eventSource";

type TalkControlPhase = "before" | "after";

interface TalkControlEvent {
  id: number;
  type: TalkControlTrigger;
  checkpointId: string | null;
  metadata?: Record<string, unknown>;
}

interface ReplyRuntimeState {
  lastActionTurn: number;
  actionTurnStamp: number;
  actionsThisTurn: number;
}

interface PendingAction {
  event: TalkControlEvent;
  checkpointId: string;
  reply: NormalizedTalkControlReply;
  state: ReplyRuntimeState;
  replyIndex: number;
}

const runtimeStates = new Map<string, ReplyRuntimeState>();
const eventQueue: TalkControlEvent[] = [];
const listeners: Array<() => void> = [];
const storyRoleLookup = new Map<string, string>();

let config: NormalizedTalkControl | undefined;
let activeCheckpointId: string | null = null;
let currentTurn = storySessionStore.getState().turn ?? 0;
let nextEventId = 1;
let interceptSuppressDepth = 0;
let selfDispatchDepth = 0;
let listenersAttached = false;
let generationActive = false;
let flushScheduled = false;
let lastChatId: string | null = null;
let lastGroupSelected = false;

const beginInterceptSuppression = () => { interceptSuppressDepth += 1; };
const endInterceptSuppression = () => { interceptSuppressDepth = Math.max(0, interceptSuppressDepth - 1); };
const beginSelfDispatch = () => { selfDispatchDepth += 1; };
const endSelfDispatch = () => { selfDispatchDepth = Math.max(0, selfDispatchDepth - 1); };

const isStoryActive = () => Boolean(config);
const isGroupActive = () => {
  const { groupId, characters } = getContext();
  if (groupId) return true;
  return Array.isArray(characters) && characters.length > 0;
};
const isSuppressed = () => interceptSuppressDepth > 0;
const isSelfDispatching = () => selfDispatchDepth > 0;

const getCheckpointConfig = (checkpointId: string | null | undefined): NormalizedTalkControlCheckpoint | undefined => {
  if (!checkpointId || !config) return undefined;
  return config.checkpoints.get(checkpointId);
};

const makeStateKey = (checkpointId: string, replyIndex: number) => `${checkpointId}::${replyIndex}`;

const getReplyRuntimeState = (checkpointId: string, replyIndex: number): ReplyRuntimeState => {
  if (replyIndex < 0) {
    return { lastActionTurn: -Infinity, actionTurnStamp: -1, actionsThisTurn: 0 };
  }
  const key = makeStateKey(checkpointId, replyIndex);
  let state = runtimeStates.get(key);
  if (!state) {
    state = { lastActionTurn: -Infinity, actionTurnStamp: -1, actionsThisTurn: 0 };
    runtimeStates.set(key, state);
  }
  if (state.actionTurnStamp !== currentTurn) {
    state.actionTurnStamp = currentTurn;
    state.actionsThisTurn = 0;
  }
  return state;
};

const queueEvent = (type: TalkControlTrigger, checkpointId: string | null, metadata?: Record<string, unknown>) => {
  if (!config) return;
  eventQueue.push({ id: nextEventId++, type, checkpointId, metadata });
  console.log("[Story TalkControl] Queued event", {
    type,
    checkpointId,
    queueLength: eventQueue.length,
    metadata,
  });
  scheduleFlush();
};

const rebuildRoleLookup = (input: NormalizedStory | null) => {
  storyRoleLookup.clear();
  if (!input?.roles) return;
  for (const [roleKey, displayName] of Object.entries(input.roles)) {
    if (typeof displayName === "string") {
      const norm = normalizeName(displayName);
      if (norm) storyRoleLookup.set(norm, displayName);
    }
    const keyNorm = normalizeName(roleKey);
    if (keyNorm && typeof displayName === "string") {
      storyRoleLookup.set(keyNorm, displayName);
    }
  }
};

const resolveCandidateNames = (reply: NormalizedTalkControlReply): string[] => {
  const names = new Set<string>();
  if (reply.memberId) names.add(reply.memberId);
  if (storyRoleLookup.has(reply.normalizedId)) {
    names.add(storyRoleLookup.get(reply.normalizedId)!);
  }
  return Array.from(names);
};

const resolveCharacterId = (reply: NormalizedTalkControlReply): number | undefined => {
  const { characters } = getContext();
  const candidates = resolveCandidateNames(reply);

  for (const candidate of candidates) {
    const byHelper = getCharacterIdByName(candidate);
    if (byHelper !== undefined && byHelper >= 0) return byHelper;

    const normalizedCandidate = normalizeName(candidate);
    const idx = characters.findIndex(entry =>
      normalizeName(entry?.name) === normalizedCandidate
    );
    if (idx >= 0) return idx;
  }

  return undefined;
};

const pickStaticReplyText = (reply: NormalizedTalkControlReply): string => {
  const { substituteParams } = getContext();
  if (reply.content.kind !== "static") return "";
  const text = reply.content.text ?? "";
  const expanded = substituteParams(text);
  return (typeof expanded === "string" ? expanded : text).trim();
};

const shuffleReplies = (replies: NormalizedTalkControlReply[]): NormalizedTalkControlReply[] => {
  const clone = replies.slice();
  for (let i = clone.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [clone[i], clone[j]] = [clone[j], clone[i]];
  }
  return clone;
};

const selectActionForEvent = (event: TalkControlEvent): PendingAction | null => {
  const checkpointId = event.checkpointId ?? activeCheckpointId;
  console.log("[Story TalkControl] Selecting action", {
    type: event.type,
    checkpointId,
    metadata: event.metadata,
  });
  if (!checkpointId) return null;
  const checkpointConfig = getCheckpointConfig(checkpointId);
  if (!checkpointConfig) return null;

  // Get replies for this trigger
  const candidateReplies = checkpointConfig.repliesByTrigger.get(event.type) ?? [];
  if (!candidateReplies.length) {
    console.log("[Story TalkControl] No replies configured for trigger", {
      checkpointId,
      event,
    });
    return null;
  }

  // Shuffle to randomize selection order
  const replies = shuffleReplies(candidateReplies);

  for (const reply of replies) {
    if (!reply.enabled) continue;

    // For afterSpeak, check if this reply is for the speaker
    if (event.type === "afterSpeak") {
      const speakerId = typeof event.metadata?.speakerId === "string" ? event.metadata.speakerId : "";
      if (speakerId) {
        const expectedIds = buildExpectedSpeakerIds(reply);
        if (!expectedIds.includes(speakerId)) {
          console.log("[Story TalkControl] Skipped reply (speaker mismatch)", {
            memberId: reply.memberId,
            trigger: reply.trigger,
            checkpointId,
            expected: expectedIds,
            actual: speakerId,
          });
          continue;
        }
      }
    }

    // Check probability
    if (Math.random() * 100 >= reply.probability) {
      console.log("[Story TalkControl] Skipped reply due to probability gate", {
        reply,
        checkpointId,
      });
      continue;
    }

    const replyIndex = checkpointConfig.replies.findIndex((item) => item === reply);
    const state = getReplyRuntimeState(checkpointId, replyIndex);
    if (state.lastActionTurn === currentTurn) {
      console.log("[Story TalkControl] Skipped reply (already dispatched this turn)", {
        reply,
        checkpointId,
      });
      continue;
    }

    console.log("[Story TalkControl] Selected reply", {
      reply,
      checkpointId,
      replyIndex,
    });
    return { event, checkpointId, reply, state, replyIndex };
  }
  console.log("[Story TalkControl] No eligible replies matched", {
    checkpointId,
    trigger: event.type,
  });
  return null;
};

const nextPendingAction = (): PendingAction | null => {
  while (eventQueue.length) {
    const event = eventQueue.shift();
    if (!event) break;
    const action = selectActionForEvent(event);
    if (action) return action;
  }
  return null;
};

const resolveCharacterEntry = (action: PendingAction): { id: number; character: any } | null => {
  const { characters } = getContext();
  const charId = resolveCharacterId(action.reply);
  if (charId === undefined) {
    console.warn("[Story TalkControl] Unable to resolve character for talk-control reply", { member: action.reply.memberId });
    return null;
  }
  const character = characters[charId];
  if (!character) {
    console.warn("[Story TalkControl] Character index missing for talk-control reply", { index: charId });
    return null;
  }
  return { id: charId, character };
};

const buildExpectedSpeakerIds = (reply: NormalizedTalkControlReply): string[] => {
  const expected = new Set<string>();
  if (reply.normalizedSpeakerId) expected.add(reply.normalizedSpeakerId);
  const mappedDisplay = storyRoleLookup.get(reply.normalizedSpeakerId);
  if (mappedDisplay) expected.add(normalizeName(mappedDisplay));
  return Array.from(expected).filter(Boolean);
};

const injectMessage = async (
  action: PendingAction,
  charId: number,
  character: any,
  text: string,
  kind: "static" | "llm",
): Promise<boolean> => {
  const { chatMetadata, getThumbnailUrl, addOneMessage, saveChat, groupId, chat, eventSource, eventTypes } = getContext();
  const content = typeof text === "string" ? text.trim() : "";
  if (!content) {
    console.warn("[Story TalkControl] Reply text empty after generation", {
      memberId: action.reply.memberId,
      checkpointId: action.checkpointId,
      trigger: action.event.type,
    });
    return false;
  }
  const timestamp = getMessageTimeStamp();


  const message: Record<string, any> = {
    name: character.name ?? action.reply.memberId,
    is_user: false,
    is_system: false,
    send_date: timestamp,
    character_id: charId,
    force_avatar: `/thumbnail?type=avatar&file=${encodeURIComponent(character.avatar || "none")}`,
    mes: content,
    original_avatar: character.avatar,
    extra: {
      api: "storyOrchestrator",
      model: "talkControl",
      reason: `talkControl:${action.event.type}`,
      storyOrchestratorTalkControl: { kind, checkpointId: action.checkpointId, event: action.event.type },
    },
    swipe_id: 0,
    swipes: [content],
    swipe_info: [
      {
        send_date: timestamp,
        gen_started: timestamp,
        gen_finished: timestamp,
        extra: {},
      },
    ],
  };

  console.log("[Story TalkControl] Injecting message", message);

  if (groupId && character.avatar && character.avatar !== "none") {
    try {
      message.force_avatar = getThumbnailUrl("avatar", character.avatar);
    } catch (err) {
      console.warn("[Story TalkControl] Failed to resolve avatar thumbnail", err);
    }
  }

  chat.push(message);
  const messageId = chat.length - 1;
  (chatMetadata as any)["tainted"] = true;
  await eventSource.emit(eventTypes.MESSAGE_RECEIVED, messageId, "talkControl");
  addOneMessage(message);
  await eventSource.emit(eventTypes.CHARACTER_MESSAGE_RENDERED, messageId, "talkControl");
  await saveChat();
  console.log("[Story TalkControl] Injected reply", {
    memberId: action.reply.memberId,
    checkpointId: action.checkpointId,
    trigger: action.event.type,
    kind,
  });
  return true;
};

const dispatchStaticAction = async (action: PendingAction): Promise<boolean> => {
  const entry = resolveCharacterEntry(action);
  if (!entry) return false;
  const text = pickStaticReplyText(action.reply);
  if (!text) {
    console.warn("[Story TalkControl] Static reply text missing", {
      memberId: action.reply.memberId,
      checkpointId: action.checkpointId,
    });
    return false;
  }
  return injectMessage(action, entry.id, entry.character, text, "static");
};

const dispatchLlmAction = async (action: PendingAction): Promise<boolean> => {
  const entry = resolveCharacterEntry(action);
  if (!entry) return false;
  const instruction = action.reply.content.kind === "llm" ? action.reply.content.instruction : undefined;
  if (!instruction) {
    console.warn("[Story TalkControl] LLM instruction missing", {
      memberId: action.reply.memberId,
      checkpointId: action.checkpointId,
    });
    return false;
  }
  const { generateQuietPrompt } = getContext();
  console.log("[Story TalkControl] Generating quiet prompt for reply", {
    memberId: action.reply.memberId,
    checkpointId: action.checkpointId,
    trigger: action.event.type,
  });
  let result = "";
  try {
    result = await generateQuietPrompt({
      quietPrompt: instruction,
      quietToLoud: false,
      quietName: action.reply.memberId,
      forceChId: entry.id,
      removeReasoning: true,
    }) as unknown as string;
  } catch (err) {
    console.warn("[Story TalkControl] Quiet prompt generation failed", err);
    return false;
  }
  return injectMessage(action, entry.id, entry.character, typeof result === "string" ? result : "", "llm");
};

const executeAction = async (action: PendingAction) => {
  beginInterceptSuppression();
  beginSelfDispatch();
  try {
    if (!isGroupActive()) {
      console.warn("[Story TalkControl] Skipped action (group not active)", {
        memberId: action.reply.memberId,
        checkpointId: action.checkpointId,
        trigger: action.event.type,
      });
      return;
    }
    console.log("[Story TalkControl] Executing action", {
      memberId: action.reply.memberId,
      checkpointId: action.checkpointId,
      trigger: action.event.type,
    });
    let dispatched = false;
    if (action.reply.content.kind === "static") {
      dispatched = await dispatchStaticAction(action);
    } else {
      dispatched = await dispatchLlmAction(action);
    }
    if (dispatched) {
      action.state.lastActionTurn = currentTurn;
      action.state.actionsThisTurn += 1;
    }
  } catch (err) {
    console.warn("[Story TalkControl] Action dispatch failed", err);
  } finally {
    endSelfDispatch();
    endInterceptSuppression();
  }
};

const handleGenerateIntercept = async (_chat: unknown, _contextSize: number, abort: (immediate: boolean) => void, type: string) => {
  console.log("[Story TalkControl] Intercept check", { type });
  if (!isStoryActive()) return;
  if (!isGroupActive()) return;
  if (isSuppressed()) return;
  if (type === "quiet") return;

  const action = nextPendingAction();
  if (!action) return;
  console.log("[Story TalkControl] Intercept aborting host generation", {
    memberId: action.reply.memberId,
    trigger: action.event.type,
    checkpointId: action.checkpointId,
  });
  try {
    abort(true);
  } catch (err) {
    console.warn("[Story TalkControl] Abort threw", err);
  }
  await executeAction(action);
};

const handleGenerationStarted = () => {
  generationActive = true;
  console.log("[Story TalkControl] Detected generation start", { pendingEvents: eventQueue.length });
};

const handleGenerationSettled = () => {
  generationActive = false;
  console.log("[Story TalkControl] Generation settled", { pendingEvents: eventQueue.length });
  scheduleFlush();
};

function scheduleFlush(): void {
  if (flushScheduled) return;
  flushScheduled = true;
  const enqueue = typeof queueMicrotask === "function"
    ? queueMicrotask
    : (cb: () => void) => Promise.resolve().then(cb);
  enqueue(() => {
    flushScheduled = false;
    void flushPendingActions();
  });
}

async function flushPendingActions(): Promise<void> {
  if (!isStoryActive()) return;
  if (!isGroupActive()) return;
  if (generationActive) {
    console.log("[Story TalkControl] Flush deferred (generation active)", { pendingEvents: eventQueue.length });
    return;
  }
  if (isSuppressed()) {
    console.log("[Story TalkControl] Flush deferred (suppressed)", { pendingEvents: eventQueue.length });
    return;
  }

  let guard = 0;
  let action = nextPendingAction();
  while (action && guard < 20) {
    guard += 1;
    try {
      console.log("[Story TalkControl] Dispatching queued action", {
        memberId: action.reply.memberId,
        trigger: action.event.type,
        checkpointId: action.checkpointId,
      });
      await executeAction(action);
    } catch (err) {
      console.warn("[Story TalkControl] Flush dispatch failed", err);
    }
    if (generationActive) {
      console.log("[Story TalkControl] Flush halted (generation restarted)", { pendingEvents: eventQueue.length });
      return;
    }
    action = nextPendingAction();
  }

  if (guard >= 20 && action) {
    console.warn("[Story TalkControl] Flush aborted after guard limit", { remainingEvents: eventQueue.length });
  }
}

const onMessageReceived = (messageId: number, messageType?: string) => {
  if (!isStoryActive() || isSelfDispatching()) return;

  const { chat } = getContext();
  const message = chat[messageId];
  if (!message || message.is_user || message.is_system) return;
  if (message?.extra?.storyOrchestratorTalkControl) return;

  const speakerName = message?.name ?? "";
  const speakerId = normalizeName(speakerName);
  queueEvent("afterSpeak", activeCheckpointId, { speakerId, speakerName, messageId, messageType });
};

const resetTalkControlState = () => {
  console.log("[Story TalkControl] Resetting state");
  runtimeStates.clear();
  eventQueue.length = 0;
  generationActive = false;
  flushScheduled = false;
  interceptSuppressDepth = 0;
  selfDispatchDepth = 0;
  nextEventId = 1;
};

const handleChatChanged = () => {
  const ctx = getContext();
  const chatId = ctx?.chatId?.toString().trim() || null;
  const groupSelected = Boolean(ctx?.groupId);

  if (lastChatId === chatId && lastGroupSelected === groupSelected) return;

  console.log("[Story TalkControl] Chat context changed", {
    from: { chatId: lastChatId, groupSelected: lastGroupSelected },
    to: { chatId, groupSelected },
  });

  lastChatId = chatId;
  lastGroupSelected = groupSelected;
  resetTalkControlState();

  if (!groupSelected && activeCheckpointId) {
    activeCheckpointId = null;
  }
};

export const talkControlInterceptor = handleGenerateIntercept;

export const setTalkControlStory = (next: NormalizedStory | null) => {
  config = next?.talkControl;
  activeCheckpointId = null;
  runtimeStates.clear();
  eventQueue.length = 0;
  generationActive = false;
  flushScheduled = false;
  rebuildRoleLookup(next ?? null);
};

export const setTalkControlCheckpoint = (checkpointId: string | null, options?: { emitEnter?: boolean }) => {
  if (activeCheckpointId && activeCheckpointId !== checkpointId) {
    queueEvent("onExit", activeCheckpointId);
  }
  activeCheckpointId = checkpointId;
  if (checkpointId && options?.emitEnter !== false) {
    queueEvent("onEnter", checkpointId);
  }
};

export const notifyTalkControlArbiterPhase = (phase: TalkControlPhase) => {
  if (!activeCheckpointId) return;
  if (phase === "before") {
    queueEvent("beforeArbiter", activeCheckpointId);
  } else {
    queueEvent("afterArbiter", activeCheckpointId);
  }
};

export const notifyTalkControlAfterSpeak = (speakerName?: string) => {
  if (!activeCheckpointId) return;
  const norm = speakerName ? normalizeName(speakerName) : "";
  queueEvent("afterSpeak", activeCheckpointId, { speakerId: norm, speakerName });
};

export const updateTalkControlTurn = (turn: number) => {
  if (!Number.isFinite(turn)) return;
  currentTurn = Math.max(0, Math.floor(turn));
};

export const initializeTalkControl = () => {
  const { eventSource, eventTypes } = getContext();
  if (listenersAttached) return;
  listenersAttached = true;

  listeners.push(subscribeToEventSource({
    source: eventSource,
    eventName: eventTypes.MESSAGE_RECEIVED,
    handler: onMessageReceived,
  }));

  listeners.push(subscribeToEventSource({
    source: eventSource,
    eventName: eventTypes.GENERATION_STARTED,
    handler: handleGenerationStarted,
  }));

  listeners.push(subscribeToEventSource({
    source: eventSource,
    eventName: eventTypes.GENERATION_STOPPED,
    handler: handleGenerationSettled,
  }));

  listeners.push(subscribeToEventSource({
    source: eventSource,
    eventName: eventTypes.GENERATION_ENDED,
    handler: handleGenerationSettled,
  }));

  const chatEvents = [
    eventTypes.CHAT_CHANGED,
    eventTypes.CHAT_CREATED,
    eventTypes.GROUP_CHAT_CREATED,
    eventTypes.CHAT_DELETED,
    eventTypes.GROUP_CHAT_DELETED,
  ].filter(Boolean);

  for (const ev of chatEvents) {
    listeners.push(subscribeToEventSource({
      source: eventSource,
      eventName: ev,
      handler: handleChatChanged,
    }));
  }

  handleChatChanged();
};

export const disposeTalkControl = () => {
  while (listeners.length) {
    const off = listeners.pop();
    try {
      off?.();
    } catch (err) {
      console.warn("[Story TalkControl] Failed to remove listener", err);
    }
  }
  listenersAttached = false;
  runtimeStates.clear();
  eventQueue.length = 0;
  interceptSuppressDepth = 0;
  selfDispatchDepth = 0;
  storyRoleLookup.clear();
  config = undefined;
  activeCheckpointId = null;
  generationActive = false;
  flushScheduled = false;
  lastChatId = null;
  lastGroupSelected = false;
};
