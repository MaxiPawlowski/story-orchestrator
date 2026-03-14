import type StoryOrchestrator from "@services/StoryOrchestrator";
import type { Role } from "@utils/story-schema";
import {
  retainChatSessionBridge,
  releaseChatSessionBridge,
  subscribeToChatSessionBridge,
  type ChatSessionBridgeEvent,
} from "@controllers/chatSessionBridge";

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
      } catch (err) {
        console.warn("[Story - TurnController] Failed to stringify value for signature", err);
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
  let unsubscribeBridge: (() => void) | null = null;
  let bridgeRetained = false;

  const cleanupListeners = () => {
    try {
      unsubscribeBridge?.();
    } catch (err) {
      console.warn("[Story - TurnController] unsubscribe failed", err);
    }
    unsubscribeBridge = null;
    if (bridgeRetained) {
      releaseChatSessionBridge();
      bridgeRetained = false;
    }
    started = false;
  };

  const reset = () => {
    lastUserSeenKey = null;
    gate.reset();
  };

  const ensureOrchestrator = () => {
    if (!orchestrator) {
      console.warn("[Story - TurnController] event received without orchestrator attached");
      return false;
    }
    return true;
  };

  const handleUserMessage = (message: { text: string; key: string }) => {
    if (!ensureOrchestrator()) return;
    if (message.key === lastUserSeenKey) return;
    if (!gate.shouldAcceptUser(message.text, message.key).accept) return;
    lastUserSeenKey = message.key;
    try {
      orchestrator?.handleUserText(message.text);
    } catch (err) {
      console.warn("[Story - TurnController] handleUserText failed", err);
    }
  };

  const handleGenerationStarted = (speakerName: string | null) => {
    if (!ensureOrchestrator()) return;
    gate.newEpoch();
    const candidate = speakerName ?? "";
    if (candidate) {
      try {
        orchestrator?.setActiveRole(candidate);
      } catch (err) {
        console.warn("[Story - TurnController] setActiveRole failed", err);
      }
    }
  };

  const handleBridgeEvent = (event: ChatSessionBridgeEvent) => {
    switch (event.type) {
      case "user-message":
        handleUserMessage(event.message);
        break;
      case "generation-started":
        handleGenerationStarted(event.generation.speakerName ?? event.generation.draftedSpeakerName ?? null);
        break;
      case "generation-stopped":
      case "generation-ended":
        gate.endEpoch();
        break;
      default:
        break;
    }
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
    retainChatSessionBridge();
    bridgeRetained = true;
    unsubscribeBridge = subscribeToChatSessionBridge(handleBridgeEvent);
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
