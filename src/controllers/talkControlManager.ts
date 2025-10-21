import type { NormalizedStory, NormalizedTalkControl, NormalizedTalkControlCheckpoint, NormalizedTalkControlMember, NormalizedTalkControlAutoReply } from "@utils/story-validator";
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

interface MemberRuntimeState {
  lastActionTurn: number;
  actionTurnStamp: number;
  actionsThisTurn: number;
}

interface PendingAction {
  event: TalkControlEvent;
  checkpointId: string;
  member: NormalizedTalkControlMember;
  reply: NormalizedTalkControlAutoReply;
  state: MemberRuntimeState;
}

const runtimeStates = new Map<string, MemberRuntimeState>();
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

const isStoryActive = () => Boolean(config?.enabled);
const isGroupActive = () => Boolean(selected_group);
const isSuppressed = () => interceptSuppressDepth > 0;
const isSelfDispatching = () => selfDispatchDepth > 0;

const getCheckpointConfig = (checkpointId: string | null | undefined): NormalizedTalkControlCheckpoint | undefined => {
  if (!checkpointId || !config) return undefined;
  return config.checkpoints.get(checkpointId);
};

const makeStateKey = (checkpointId: string, member: NormalizedTalkControlMember) => `${checkpointId}::${member.normalizedId}`;

const getMemberRuntimeState = (checkpointId: string, member: NormalizedTalkControlMember): MemberRuntimeState => {
  const key = makeStateKey(checkpointId, member);
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
  if (!config?.enabled) return;
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

const resolveCandidateNames = (member: NormalizedTalkControlMember): string[] => {
  const names = new Set<string>();
  if (member.memberId) names.add(member.memberId);
  if (storyRoleLookup.has(member.normalizedId)) {
    names.add(storyRoleLookup.get(member.normalizedId)!);
  }
  return Array.from(names);
};

const resolveCharacterId = (member: NormalizedTalkControlMember): number | undefined => {
  const candidates = resolveCandidateNames(member);
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

const pickStaticReplyText = (reply: NormalizedTalkControlAutoReply): string => {
  if (reply.kind !== "static") return "";
  const expanded = substituteParams(reply.text);
  return typeof expanded === "string" ? expanded.trim() : reply.text;
};

const pickWeightedReply = (member: NormalizedTalkControlMember): NormalizedTalkControlAutoReply | null => {
  const entries = member.autoReplies ?? [];
  if (!entries.length) return null;
  const total = entries.reduce((acc, item) => acc + Math.max(1, item.weight ?? 1), 0);
  const roll = Math.random() * total;
  let cumulative = 0;
  for (const entry of entries) {
    cumulative += Math.max(1, entry.weight ?? 1);
    if (roll <= cumulative) {
      return entry;
    }
  }
  return entries[entries.length - 1];
};

const shuffleMembers = (members: NormalizedTalkControlMember[]): NormalizedTalkControlMember[] => {
  const clone = members.slice();
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
  const members = shuffleMembers(checkpointConfig.members);
  for (const member of members) {
    if (!member.enabled) continue;
    const probability = member.probabilities[event.type];
    if (!probability || probability <= 0) continue;
    if (event.type === "afterSpeak") {
      const speakerId = typeof event.metadata?.speakerId === "string" ? event.metadata.speakerId : "";
      if (speakerId && speakerId !== member.normalizedId) continue;
    }
    if (Math.random() * 100 >= probability) continue;
    const state = getMemberRuntimeState(checkpointId, member);
    if (state.actionsThisTurn >= member.maxPerTurn) continue;
    if (Number.isFinite(state.lastActionTurn) && (currentTurn - state.lastActionTurn) <= member.cooldownTurns) continue;
    const reply = pickWeightedReply(member);
    if (!reply) continue;
    state.lastActionTurn = currentTurn;
    state.actionsThisTurn += 1;
    return { event, checkpointId, member, reply, state };
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
  const charId = resolveCharacterId(action.member);
  if (charId === undefined) {
    console.warn("[TalkControl] Unable to resolve character for static reply", { member: action.member.memberId });
    return;
  }
  const character = characters[charId];
  if (!character) {
    console.warn("[TalkControl] Character index missing for static reply", { index: charId });
    return;
  }
  const text = pickStaticReplyText(action.reply);
  if (!text) return;

  const limited = text.length > action.member.maxCharsPerAuto ? text.slice(0, action.member.maxCharsPerAuto) : text;

  const timestamp = getMessageTimeStamp();
  const message: Record<string, any> = {
    name: character.name ?? action.member.memberId,
    is_user: false,
    is_system: false,
    send_date: timestamp,
    mes: limited,
    original_avatar: character.avatar,
    extra: {
      api: "storyDriver",
      model: "talkControl",
      reason: `talkControl:${action.event.type}`,
      storyDriverTalkControl: { kind: "static", checkpointId: action.checkpointId, event: action.event.type },
    },
    swipe_id: 0,
    swipes: [limited],
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
      console.warn("[TalkControl] Failed to resolve avatar thumbnail", err);
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
  const charId = resolveCharacterId(action.member);
  if (charId === undefined) {
    console.warn("[TalkControl] Unable to resolve character for LLM reply", { member: action.member.memberId });
    return;
  }
  const params: Record<string, unknown> = {
    quiet_prompt: action.reply.kind === "llm" ? action.reply.instruction : undefined,
    quietToLoud: !action.member.sendAsQuiet,
    quietName: action.member.memberId,
  };
  if (action.member.forceSpeaker) {
    params.force_chid = charId;
  }

  await generateGroupWrapper(true, "normal", params);
};

const executeAction = async (action: PendingAction) => {
  beginInterceptSuppression();
  beginSelfDispatch();
  try {
    if (!isGroupActive()) return;
    if (action.reply.kind === "static") {
      await dispatchStaticAction(action);
    } else {
      await dispatchLlmAction(action);
    }
  } catch (err) {
    console.warn("[TalkControl] Action dispatch failed", err);
  } finally {
    endSelfDispatch();
    endInterceptSuppression();
  }
};

const handleGenerateIntercept = async (_chat: unknown, _contextSize: number, abort: (immediate: boolean) => void, type: string) => {
  if (!isStoryActive()) return;
  if (!isGroupActive()) return;
  if (isSuppressed()) return;
  if (type === "quiet") return;

  const action = nextPendingAction();
  if (!action) return;
  try {
    abort(true);
  } catch (err) {
    console.warn("[TalkControl] Abort threw", err);
  }
  void executeAction(action);
};

const onMessageReceived = (messageId: number, messageType?: string) => {
  if (!isStoryActive()) return;
  if (isSelfDispatching()) return;
  if (!Array.isArray(chat)) return;
  const message = chat[messageId];
  if (!message || message.is_user || message.is_system) return;
  if (message?.extra?.storyDriverTalkControl) return;
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
      console.warn("[TalkControl] Failed to remove listener", err);
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
