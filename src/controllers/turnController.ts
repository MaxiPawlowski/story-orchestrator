import type StoryOrchestrator from "@services/StoryOrchestrator";
import type { Role } from "@utils/story-schema";
import { chat, eventSource, event_types, getCharacterNameById } from "@services/SillyTavernAPI";
import { subscribeToEventSource } from "@utils/eventSource";

interface ListenerDisposer {
  (): void;
}

const pickUserTextFromChat = (): { text: string; key: string } | null => {
  if (!Array.isArray(chat) || chat.length === 0) return null;
  for (let i = chat.length - 1; i >= 0; i--) {
    const message = chat[i];
    const isUser = !!(message?.is_user || message?.isUser || message?.role === "user");
    if (!isUser) continue;
    const text =
      (typeof message?.mes === "string" && message.mes.trim()) ||
      (typeof message?.text === "string" && message.text.trim()) ||
      (typeof message?.message === "string" && message.message.trim()) ||
      (typeof message?.data?.text === "string" && message.data.text.trim()) ||
      (typeof message?.data?.mes === "string" && message.data.mes.trim()) ||
      "";
    if (!text) continue;
    const key = String(message?.mesId ?? message?.id ?? message?._ts ?? i);
    return { text, key };
  }
  return null;
};

class TurnGate {
  private genEpoch = 0;
  private lastUserSig: string | null = null;
  private lastRoleKey: string | null = null;

  newEpoch() {
    this.genEpoch += 1;
    this.lastRoleKey = null;
  }

  endEpoch() {
    this.lastRoleKey = null;
  }

  shouldAcceptUser(text: string, msgId?: string | number) {
    const hashish = (value: unknown) => {
      try {
        return JSON.stringify(value)?.slice(0, 200);
      } catch {
        return String(value);
      }
    };

    const signature = hashish([text.trim(), msgId]).toLowerCase();
    if (!text.trim()) return { accept: false as const, reason: "empty" as const };
    if (signature && signature === this.lastUserSig) {
      return { accept: false as const, reason: "duplicate" as const };
    }
    this.lastUserSig = signature;
    return { accept: true as const };
  }

  shouldApplyRole(role: Role, checkpointId: string | number) {
    const key = [this.genEpoch, checkpointId, role].join(":");
    if (key === this.lastRoleKey) return false;
    this.lastRoleKey = key;
    return true;
  }

  reset() {
    this.genEpoch = 0;
    this.lastRoleKey = null;
    this.lastUserSig = null;
  }
}

export interface TurnController {
  attach(orchestrator: StoryOrchestrator): void;
  detach(): void;
  start(): void;
  stop(): void;
  dispose(): void;
  shouldApplyRole(role: Role, checkpointIndex: number): boolean;
  reset(): void;
}

export const createTurnController = (): TurnController => {
  const gate = new TurnGate();
  let orchestrator: StoryOrchestrator | null = null;
  let started = false;
  let disposed = false;
  let lastUserSeenKey: string | null = null;
  let lastDraftName: string | null = null;
  const listeners: ListenerDisposer[] = [];

  const cleanupListeners = () => {
    while (listeners.length) {
      const off = listeners.pop();
      try {
        off?.();
      } catch (err) {
        console.warn("[TurnController] unsubscribe failed", err);
      }
    }
    started = false;
  };

  const reset = () => {
    lastUserSeenKey = null;
    lastDraftName = null;
    gate.reset();
  };

  const ensureOrchestrator = () => {
    if (!orchestrator) {
      console.warn("[TurnController] event received without orchestrator attached");
      return false;
    }
    return true;
  };

  const handleUserMessage = () => {
    if (!ensureOrchestrator()) return;

    const fire = () => {
      const pick = pickUserTextFromChat();
      if (!pick) return false;
      if (pick.key === lastUserSeenKey) return false;
      if (!gate.shouldAcceptUser(pick.text, pick.key).accept) return false;
      lastUserSeenKey = pick.key;
      try {
        orchestrator?.handleUserText(pick.text);
      } catch (err) {
        console.warn("[TurnController] handleUserText failed", err);
      }
      return true;
    };

    if (fire()) return;
    queueMicrotask(() => { fire(); });
    setTimeout(() => { fire(); }, 0);
  };

  const handleDrafted = (payload: any) => {
    if (!ensureOrchestrator()) return;
    const chid = Array.isArray(payload) ? payload[0] : payload;
    const idNum = Number.parseInt(String(chid), 10);
    const name = Number.isFinite(idNum) && !Number.isNaN(idNum)
      ? getCharacterNameById?.(idNum)
      : (typeof payload?.name === "string" ? payload.name : undefined);
    lastDraftName = name ?? null;
  };

  const handleGenerationStarted = (payload: any) => {
    if (!ensureOrchestrator()) return;
    gate.newEpoch();
    let candidate = lastDraftName ?? "";
    const data = Array.isArray(payload) ? payload[0] : payload;
    candidate ||= (data?.character && String(data.character)) || (data?.quietName && String(data.quietName)) || "";
    if (candidate) {
      try {
        orchestrator?.setActiveRole(candidate);
      } catch (err) {
        console.warn("[TurnController] setActiveRole failed", err);
      }
    }
  };

  const handleGenerationStopped = () => {
    gate.endEpoch();
  };

  const handleGenerationEnded = () => {
    gate.endEpoch();
    lastDraftName = null;
  };

  const attach = (next: StoryOrchestrator) => {
    orchestrator = next;
    reset();
  };

  const detach = () => {
    cleanupListeners();
    orchestrator = null;
    reset();
  };

  const start = () => {
    if (started || disposed) return;
    if (!orchestrator) return;
    started = true;

    listeners.push(subscribeToEventSource({
      source: eventSource,
      eventName: event_types.MESSAGE_SENT,
      handler: handleUserMessage,
    }));

    listeners.push(subscribeToEventSource({
      source: eventSource,
      eventName: event_types.GROUP_MEMBER_DRAFTED,
      handler: handleDrafted,
    }));

    listeners.push(subscribeToEventSource({
      source: eventSource,
      eventName: event_types.GENERATION_STARTED,
      handler: handleGenerationStarted,
    }));

    listeners.push(subscribeToEventSource({
      source: eventSource,
      eventName: event_types.GENERATION_STOPPED,
      handler: handleGenerationStopped,
    }));

    listeners.push(subscribeToEventSource({
      source: eventSource,
      eventName: event_types.GENERATION_ENDED,
      handler: handleGenerationEnded,
    }));
  };

  const stop = () => {
    cleanupListeners();
  };

  const dispose = () => {
    disposed = true;
    cleanupListeners();
    orchestrator = null;
    reset();
  };

  const shouldApplyRole = (role: Role, checkpointIndex: number) => gate.shouldApplyRole(role, checkpointIndex);

  return {
    attach,
    detach,
    start,
    stop,
    dispose,
    shouldApplyRole,
    reset,
  };
};
