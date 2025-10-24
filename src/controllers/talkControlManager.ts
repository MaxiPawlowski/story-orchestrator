import type { NormalizedStory, NormalizedTalkControl, NormalizedTalkControlCheckpoint, NormalizedTalkControlReply } from "@utils/story-validator";
import { normalizeName } from "@utils/story-validator";
import type { TalkControlTrigger } from "@utils/story-schema";
import { storySessionStore } from "@store/storySessionStore";
import {
  chat,
  characters,
  selected_group,
  eventSource,
  event_types,
  generateGroupWrapper,
  addOneMessage,
  saveChatConditional,
  getMessageTimeStamp,
  getThumbnailUrl,
  chat_metadata,
  substituteParams,
  getCharacterIdByName,
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
}

const runtimeStates = new Map<string, ReplyRuntimeState>();
const eventQueue: TalkControlEvent[] = [];
const listeners: Array<() => void> = [];
const storyRoleLookup = new Map<string, string>();

let story: NormalizedStory | null = null;
let config: NormalizedTalkControl | undefined;
let activeCheckpointId: string | null = null;
let currentTurn = storySessionStore.getState().turn ?? 0;
let nextEventId = 1;
let interceptSuppressDepth = 0;
let selfDispatchDepth = 0;
let listenersAttached = false;

const beginInterceptSuppression = () => { interceptSuppressDepth += 1; };
const endInterceptSuppression = () => { interceptSuppressDepth = Math.max(0, interceptSuppressDepth - 1); };
const beginSelfDispatch = () => { selfDispatchDepth += 1; };
const endSelfDispatch = () => { selfDispatchDepth = Math.max(0, selfDispatchDepth - 1); };

const isStoryActive = () => Boolean(config);
const isGroupActive = () => Boolean(selected_group);
const isSuppressed = () => interceptSuppressDepth > 0;
const isSelfDispatching = () => selfDispatchDepth > 0;

const getCheckpointConfig = (checkpointId: string | null | undefined): NormalizedTalkControlCheckpoint | undefined => {
  if (!checkpointId || !config) return undefined;
  return config.checkpoints.get(checkpointId);
};

const makeStateKey = (checkpointId: string, replyIndex: number) => `${checkpointId}::${replyIndex}`;

const getReplyRuntimeState = (checkpointId: string, replyIndex: number): ReplyRuntimeState => {
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
  const candidates = resolveCandidateNames(reply);
  for (const candidate of candidates) {
    const byHelper = getCharacterIdByName(candidate);
    if (byHelper !== undefined) return byHelper;
    const normalizedCandidate = normalizeName(candidate);
    for (let idx = 0; idx < characters.length; idx += 1) {
      const entry = characters[idx];
      const name = typeof entry?.name === "string" ? entry.name : "";
      if (normalizeName(name) === normalizedCandidate) return idx;
    }
  }
  return undefined;
};

const pickStaticReplyText = (reply: NormalizedTalkControlReply): string => {
  if (reply.content.kind !== "static") return "";
  const text = reply.content.text ?? "";
  const expanded = substituteParams(text);
  return typeof expanded === "string" ? expanded.trim() : text;
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
  if (!checkpointId) return null;
  const checkpointConfig = getCheckpointConfig(checkpointId);
  if (!checkpointConfig) return null;

  // Get replies for this trigger
  const candidateReplies = checkpointConfig.repliesByTrigger.get(event.type) ?? [];
  if (!candidateReplies.length) return null;

  // Shuffle to randomize selection order
  const replies = shuffleReplies(candidateReplies);

  for (let idx = 0; idx < replies.length; idx += 1) {
    const reply = replies[idx];
    if (!reply.enabled) continue;

    // For afterSpeak, check if this reply is for the speaker
    if (event.type === "afterSpeak") {
      const speakerId = typeof event.metadata?.speakerId === "string" ? event.metadata.speakerId : "";
      if (speakerId && speakerId !== reply.normalizedId) continue;
    }

    // Check probability
    if (Math.random() * 100 >= reply.probability) continue;

    return { event, checkpointId, reply, state: getReplyRuntimeState(checkpointId, idx) };
  }
  return null;
};

const nextPendingAction = (): PendingAction | null => {
  while (eventQueue.length) {
    const event = eventQueue.shift()!;
    const action = selectActionForEvent(event);
    if (action) return action;
  }
  return null;
};

const dispatchStaticAction = async (action: PendingAction) => {
  const charId = resolveCharacterId(action.reply);
  if (charId === undefined) {
    console.warn("[Story TalkControl] Unable to resolve character for static reply", { member: action.reply.memberId });
    return;
  }
  const character = characters[charId];
  if (!character) {
    console.warn("[Story TalkControl] Character index missing for static reply", { index: charId });
    return;
  }
  const text = pickStaticReplyText(action.reply);
  if (!text) return;

  const timestamp = getMessageTimeStamp();
  const message: Record<string, any> = {
    name: character.name ?? action.reply.memberId,
    is_user: false,
    is_system: false,
    send_date: timestamp,
    mes: text,
    original_avatar: character.avatar,
    extra: {
      api: "storyOrchestrator",
      model: "talkControl",
      reason: `talkControl:${action.event.type}`,
      storyOrchestratorTalkControl: { kind: "static", checkpointId: action.checkpointId, event: action.event.type },
    },
    swipe_id: 0,
    swipes: [text],
    swipe_info: [
      {
        send_date: timestamp,
        gen_started: timestamp,
        gen_finished: timestamp,
        extra: {},
      },
    ],
  };

  if (selected_group && character.avatar && character.avatar !== "none") {
    try {
      message.force_avatar = getThumbnailUrl("avatar", character.avatar);
    } catch (err) {
      console.warn("[Story TalkControl] Failed to resolve avatar thumbnail", err);
    }
  }

  chat.push(message);
  const messageId = chat.length - 1;
  chat_metadata["tainted"] = true;
  await eventSource.emit(event_types.MESSAGE_RECEIVED, messageId, "talkControl");
  addOneMessage(message);
  await eventSource.emit(event_types.CHARACTER_MESSAGE_RENDERED, messageId, "talkControl");
  await saveChatConditional();
};

const dispatchLlmAction = async (action: PendingAction) => {
  const charId = resolveCharacterId(action.reply);
  if (charId === undefined) {
    console.warn("[Story TalkControl] Unable to resolve character for LLM reply", { member: action.reply.memberId });
    return;
  }
  const instruction = action.reply.content.kind === "llm" ? action.reply.content.instruction : undefined;
  const params: Record<string, unknown> = {
    quiet_prompt: instruction,
    quietToLoud: true,
    quietName: action.reply.memberId,
    force_chid: charId,
  };

  await generateGroupWrapper(true, "normal", params);
};

const executeAction = async (action: PendingAction) => {
  beginInterceptSuppression();
  beginSelfDispatch();
  try {
    if (!isGroupActive()) return;
    if (action.reply.content.kind === "static") {
      await dispatchStaticAction(action);
    } else {
      await dispatchLlmAction(action);
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
  try {
    abort(true);
  } catch (err) {
    console.warn("[Story TalkControl] Abort threw", err);
  }
  executeAction(action);
};

const onMessageReceived = (messageId: number, messageType?: string) => {
  if (!isStoryActive()) return;
  if (isSelfDispatching()) return;
  if (!Array.isArray(chat)) return;
  const message = chat[messageId];
  if (!message || message.is_user || message.is_system) return;
  if (message?.extra?.storyOrchestratorTalkControl) return;
  const speakerName = typeof message?.name === "string" ? message.name : "";
  const speakerId = normalizeName(speakerName);
  queueEvent("afterSpeak", activeCheckpointId, { speakerId, speakerName, messageId, messageType });
};

export const talkControlInterceptor = handleGenerateIntercept;

export const setTalkControlStory = (next: NormalizedStory | null) => {
  story = next;
  config = next?.talkControl;
  activeCheckpointId = null;
  runtimeStates.clear();
  eventQueue.length = 0;
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
  if (listenersAttached) return;
  listenersAttached = true;
  listeners.push(subscribeToEventSource({
    source: eventSource,
    eventName: event_types.MESSAGE_RECEIVED,
    handler: onMessageReceived,
  }));
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
  story = null;
  config = undefined;
  activeCheckpointId = null;
};
