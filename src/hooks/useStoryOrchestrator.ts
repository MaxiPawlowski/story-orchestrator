import { useCallback, useEffect, useRef, useState } from "react";
import type { NormalizedStory } from "utils/story-validator";
import type { Role } from "utils/story-schema";
import StoryOrchestrator, { type OrchestratorCompositeState } from "@services/StoryOrchestrator";
import {
  chat,
  eventSource,
  event_types,
  getCharacterNameById,
} from "@services/SillyTavernAPI";
import { subscribeToEventSource } from "@utils/eventSource";

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
}

type Listener = () => void;

interface RuntimeState {
  gate: TurnGate;
  listeners: Listener[];
  orchestrator: StoryOrchestrator | null;
  lastUserSeenKey: string | null;
  lastDraftName: string | null;
  disposed: boolean;
  intervalTurns: number;
}

const createRuntimeState = (intervalTurns: number): RuntimeState => ({
  gate: new TurnGate(),
  listeners: [],
  orchestrator: null,
  lastUserSeenKey: null,
  lastDraftName: null,
  disposed: false,
  intervalTurns,
});

const disposeListeners = (runtime: RuntimeState) => {
  while (runtime.listeners.length) {
    const off = runtime.listeners.pop();
    try {
      off?.();
    } catch (err) {
      console.warn("[StoryRuntime] unsubscribe failed", err);
    }
  }
};

const registerListeners = (runtime: RuntimeState, orchestrator: StoryOrchestrator) => {
  disposeListeners(runtime);

  runtime.listeners.push(subscribeToEventSource({
    source: eventSource,
    eventName: event_types.MESSAGE_SENT,
    handler: () => {
      const fire = () => {
        const pick = pickUserTextFromChat();
        if (!pick) return false;
        if (pick.key === runtime.lastUserSeenKey) return false;
        if (!runtime.gate.shouldAcceptUser(pick.text, pick.key).accept) return false;
        runtime.lastUserSeenKey = pick.key;
        orchestrator.handleUserText(pick.text);
        return true;
      };
      if (fire()) return;
      queueMicrotask(() => { fire(); });
      setTimeout(() => { fire(); }, 0);
    },
  }));

  runtime.listeners.push(subscribeToEventSource({
    source: eventSource,
    eventName: event_types.GROUP_MEMBER_DRAFTED,
    handler: (payload: any) => {
      const chid = Array.isArray(payload) ? payload[0] : payload;
      const idNum = Number.parseInt(String(chid), 10);
      const name = Number.isFinite(idNum) && !Number.isNaN(idNum)
        ? getCharacterNameById?.(idNum)
        : (typeof payload?.name === "string" ? payload.name : undefined);
      runtime.lastDraftName = name ?? null;
    },
  }));

  runtime.listeners.push(subscribeToEventSource({
    source: eventSource,
    eventName: event_types.GENERATION_STARTED,
    handler: (payload: any) => {
      runtime.gate.newEpoch();
      let candidate = runtime.lastDraftName ?? "";
      const data = Array.isArray(payload) ? payload[0] : payload;
      candidate ||= (data?.character && String(data.character)) || (data?.quietName && String(data.quietName)) || "";
      const stops: string[] = Array.isArray(data?.stop) ? data.stop
        : Array.isArray(data?.stopping_strings) ? data.stopping_strings : [];
      if (!candidate && stops.length) {
        const found = stops.find((s) => /[:�E�F]$/.test(s.trim()));
        if (found) candidate = found.replace(/\s*[:�E�F]\s*$/, "").trim();
      }
      if (candidate) orchestrator.setActiveRole(candidate);
    },
  }));

  runtime.listeners.push(subscribeToEventSource({
    source: eventSource,
    eventName: event_types.GENERATION_STOPPED,
    handler: () => {
      runtime.gate.endEpoch();
    },
  }));

  runtime.listeners.push(subscribeToEventSource({
    source: eventSource,
    eventName: event_types.GENERATION_ENDED,
    handler: () => {
      runtime.lastDraftName = null;
      runtime.gate.endEpoch();
    },
  }));
};

const resetRuntime = (runtime: RuntimeState) => {
  disposeListeners(runtime);
  runtime.orchestrator = null;
  runtime.lastDraftName = null;
  runtime.lastUserSeenKey = null;
  runtime.gate.endEpoch();
};

export interface StoryOrchestratorResult {
  ready: boolean;
  activateIndex: (index: number) => void;
  // mirrored composite state so provider doesn't need other hooks
  requirements: OrchestratorCompositeState['requirements'];
  runtime: OrchestratorCompositeState['runtime'];
  hydrated: boolean;
  reloadPersona: () => void | Promise<void>;
  updateCheckpointStatus: (index: number, status: any) => void; // kept generic to avoid circular type import
  setOnActivateCheckpoint: (cb?: (index: number) => void) => void;
}

export function useStoryOrchestrator(
  story: NormalizedStory | null | undefined,
  intervalTurns: number,
  options?: {
    onTurnTick?: (next: { turn: number; sinceEval: number }) => void;
    onEvaluated?: (ev: { outcome: "continue" | "win" | "fail"; reason: "interval" | "win" | "fail"; turn: number; matched?: string; cpIndex: number }) => void;
    onComposite?: (state: OrchestratorCompositeState) => void;
  },
): StoryOrchestratorResult {
  const [ready, setReady] = useState<boolean>(false);
  const [composite, setComposite] = useState<OrchestratorCompositeState | null>(null);
  const runtimeRef = useRef<RuntimeState>(createRuntimeState(intervalTurns));
  const mountedRef = useRef(true);

  useEffect(() => () => {
    mountedRef.current = false;
  }, []);


  const safeSetReady = useCallback((value: boolean) => {
    if (mountedRef.current) setReady(value);
  }, []);

  useEffect(() => {
    const runtime = runtimeRef.current;
    runtime.disposed = false;

    resetRuntime(runtime);
    safeSetReady(false);
    if (!story) {
      return () => {
        runtime.disposed = true;
        resetRuntime(runtime);
      };
    }

    runtime.intervalTurns = intervalTurns;

    let cancelled = false;

    const run = async () => {
      let orchestrator: StoryOrchestrator | null = null;
      const shouldApplyRole = (role: Role) => {
        if (!orchestrator) return true;
        return runtime.gate.shouldApplyRole(role, orchestrator.index());
      };

      orchestrator = new StoryOrchestrator({
        story,
        shouldApplyRole,
        setEvalHooks: (hooks) => {
          hooks.onEvaluated?.((ev) => {
            console.log("[StoryRuntime] onEvaluated", ev);
            try { options?.onEvaluated?.(ev); } catch (err) { console.warn("[StoryRuntime] onEvaluated cb failed", err); }
          });
        },
        onTurnTick: ({ turn, sinceEval }) => {
          try { options?.onTurnTick?.({ turn, sinceEval }); } catch (err) { console.warn("[StoryRuntime] onTurnTick cb failed", err); }
        },
        onActivateIndex: (_index) => { },
        onCompositeState: (state) => {
          setComposite(state);
          try { options?.onComposite?.(state); } catch (e) { console.warn('[StoryRuntime] onComposite cb failed', e); }
        },
      });

      orchestrator.setIntervalTurns(runtime.intervalTurns);
      runtime.orchestrator = orchestrator;

      registerListeners(runtime, orchestrator);

      try {
        await orchestrator.init();
        if (cancelled || runtime.disposed) return;
        safeSetReady(true);
      } catch (err) {
        console.error("[Story/useStoryOrchestrator] init failed", err);
        if (!cancelled && !runtime.disposed) safeSetReady(false);
      }
    };

    void run();

    return () => {
      cancelled = true;
      runtime.disposed = true;
      resetRuntime(runtime);
      safeSetReady(false);
    };
  }, [story, safeSetReady]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    runtime.intervalTurns = intervalTurns;
    runtime.orchestrator?.setIntervalTurns(runtime.intervalTurns);
  }, [intervalTurns]);

  const reloadPersona = useCallback(() => runtimeRef.current.orchestrator?.reloadPersona(), []);

  const updateCheckpointStatus = useCallback((i: number, status: any) => {
    runtimeRef.current.orchestrator?.updateCheckpointStatus(i, status);
  }, []);

  const setOnActivateCheckpoint = useCallback((cb?: (i: number) => void) => {
    runtimeRef.current.orchestrator?.setOnActivateCheckpoint(cb);
  }, []);

  const activateIndex = useCallback((index: number) => {
    runtimeRef.current.orchestrator?.activateIndex(index);
  }, []);

  return {
    ready,
    activateIndex,
    requirements: composite?.requirements ?? {
      requirementsReady: false,
      currentUserName: '',
      personaDefined: false,
      groupChatSelected: false,
      worldLorePresent: true,
      worldLoreMissing: [],
      requiredRolesPresent: false,
      missingRoles: [],
    },
    runtime: composite?.runtime ?? { checkpointIndex: 0, checkpointStatuses: [], turnsSinceEval: 0 },
    hydrated: composite?.hydrated ?? false,
    reloadPersona,
    updateCheckpointStatus,
    setOnActivateCheckpoint,
  };
}

export default useStoryOrchestrator;

