import { useCallback, useEffect, useRef, useState } from "react";
import type { NormalizedStory } from "@services/SchemaService/story-validator";
import type { Role } from "@services/SchemaService/story-schema";
import { eventSource, event_types, getCharacterNameById, chat } from "@services/SillyTavernAPI";
import { PresetService } from "@services/PresetService";
import { StoryOrchestrator } from "@services/StoryService/StoryOrchestrator";
import { DEFAULT_INTERVAL_TURNS } from "@services/StoryService/story-state";

const pickUserTextFromChat = (): { text: string; key: string } | null => {
  if (!Array.isArray(chat) || chat.length === 0) return null;
  for (let i = chat.length - 1; i >= 0; i--) {
    const m = chat[i];
    const isUser = !!(m?.is_user || m?.isUser || m?.role === "user");
    if (!isUser) continue;
    const text =
      (typeof m?.mes === "string" && m.mes.trim()) ||
      (typeof m?.text === "string" && m.text.trim()) ||
      (typeof m?.message === "string" && m.message.trim()) ||
      (typeof m?.data?.text === "string" && m.data.text.trim()) ||
      (typeof m?.data?.mes === "string" && m.data.mes.trim()) ||
      "";
    if (!text) continue;
    const key = String(m?.mesId ?? m?.id ?? m?._ts ?? i);
    return { text, key };
  }
  return null;
};

class TurnGate {
  genEpoch = 0;
  lastUserSig: string | null = null;
  lastRoleKey: string | null = null;

  newEpoch() {
    this.genEpoch++;
    this.lastRoleKey = null;
  }

  endEpoch() {
    this.lastRoleKey = null;
  }

  shouldAcceptUser(text: string, msgId?: string | number) {
    function hashish(x: unknown) {
      try {
        return JSON.stringify(x)?.slice(0, 200);
      } catch {
        return String(x);
      }
    }
    const sig = hashish([text.trim(), msgId]).toLowerCase();
    if (!text.trim()) return { accept: false, reason: "empty" as const };
    if (sig && sig === this.lastUserSig) return { accept: false, reason: "duplicate" as const };
    this.lastUserSig = sig;
    return { accept: true as const };
  }

  shouldApplyRole(role: Role, checkpointId: string | number) {
    const key = [this.genEpoch, checkpointId, role].join(":");
    if (key === this.lastRoleKey) return false;
    this.lastRoleKey = key;
    return true;
  }
}

const sanitizeIntervalTurns = (value: number): number => {
  if (!Number.isFinite(value)) return DEFAULT_INTERVAL_TURNS;
  const int = Math.floor(value);
  return int >= 1 ? int : DEFAULT_INTERVAL_TURNS;
};

export interface StoryOrchestratorResult {
  ready: boolean;
  activateIndex: (index: number) => void;
}

export function useStoryOrchestrator(
  story: NormalizedStory | null | undefined,
  requirementsReady: boolean,
  intervalTurns: number,
): StoryOrchestratorResult {
  const [ready, setReady] = useState<boolean>(false);
  const orchRef = useRef<StoryOrchestrator | null>(null);
  const gateRef = useRef(new TurnGate());
  const lastUserSeenKeyRef = useRef<string | null>(null);
  const lastDraftRef = useRef<string | null>(null);

  useEffect(() => {
    if (!story?.basePreset || !requirementsReady) {
      setReady(false);
      orchRef.current = null;
      gateRef.current.endEpoch();
      lastDraftRef.current = null;
      lastUserSeenKeyRef.current = null;
      return;
    }

    const initialInterval = sanitizeIntervalTurns(intervalTurns);
    const svc = new PresetService({
      base: story.basePreset.name ? { source: "named", name: story.basePreset.name } : { source: "current" },
      storyId: story.title,
      storyTitle: story.title,
      roleDefaults: story.roleDefaults,
    });

    const orch = new StoryOrchestrator({
      story,
      presetService: svc,
      onRoleApplied: (role, cp) => console.log("[StoryOrch] role applied", { role, cp }),
      shouldApplyRole: (role: Role): boolean => gateRef.current.shouldApplyRole(role, orch.index()),
      setEvalHooks: (setters) => {
        setters.onEvaluated = (ev) => console.log("[Story/useSO] onEvaluated", ev);
      },
    });

    orch.setIntervalTurns(initialInterval);

    orchRef.current = orch;
    lastUserSeenKeyRef.current = null;
    lastDraftRef.current = null;
    gateRef.current.endEpoch();

    const offs: Array<() => void> = [];
    const subscribe = (name: string, handler: (...args: any[]) => void) => {
      try {
        const off = eventSource?.on?.(name, handler);
        if (typeof off === "function") {
          offs.push(off);
        } else if (eventSource?.off) {
          offs.push(() => eventSource.off(name, handler));
        }
      } catch (e) {
        console.warn("[Story/useSO] subscribe failed", name, e);
      }
    };

    subscribe(event_types.MESSAGE_SENT, (payload: any, ...rest) => {
      console.log("[Story/useSO] event", "MESSAGE_SENT", payload, ...rest);
      const fire = () => {
        const pick = pickUserTextFromChat();
        if (!pick) return false;
        if (pick.key === lastUserSeenKeyRef.current) return false;
        const ok = gateRef.current.shouldAcceptUser(pick.text, pick.key).accept;
        if (!ok) return false;
        lastUserSeenKeyRef.current = pick.key;
        console.log("[Story/useSO] pulled-from-chat", { key: pick.key, text: pick.text });
        orch.handleUserText(pick.text);
        return true;
      };
      if (fire()) return;
      queueMicrotask(() => {
        fire();
      });
      setTimeout(() => {
        fire();
      }, 0);
    });

    subscribe(event_types.GROUP_MEMBER_DRAFTED, (raw: any) => {
      const chid = Array.isArray(raw) ? raw[0] : raw;
      const idNum = Number.parseInt(String(chid), 10);
      const name = Number.isFinite(idNum) && !Number.isNaN(idNum)
        ? getCharacterNameById?.(idNum)
        : (typeof raw?.name === "string" ? raw.name : undefined);
      lastDraftRef.current = name ?? null;
      console.log("[Story/useSO] Event", "GROUP_MEMBER_DRAFTED", raw, "->", lastDraftRef.current);
    });

    subscribe(event_types.GENERATION_STARTED, (payload: any) => {
      gateRef.current.newEpoch();
      let candidate = lastDraftRef.current ?? "";
      const p = Array.isArray(payload) ? payload[0] : payload;
      candidate ||= (p?.character && String(p.character)) || (p?.quietName && String(p.quietName)) || "";
      const stops: string[] = Array.isArray(p?.stop) ? p.stop
        : Array.isArray(p?.stopping_strings) ? p.stopping_strings : [];
      if (!candidate && stops.length) {
        const found = stops.find((s) => /[:：]$/.test(s.trim()));
        if (found) candidate = found.replace(/\s*[:：]\s*$/, "").trim();
      }
      if (candidate) orch.setActiveRole(candidate);
    });

    subscribe(event_types.GENERATION_STOPPED, () => {
      gateRef.current.endEpoch();
    });

    subscribe(event_types.GENERATION_ENDED, () => {
      lastDraftRef.current = null;
      gateRef.current.endEpoch();
    });

    (async () => {
      try {
        await orch.init();
        setReady(true);
      } catch (err) {
        console.error("[Story/useSO] init failed", err);
        setReady(false);
      }
    })();

    return () => {
      offs.forEach((off) => {
        try {
          off();
        } catch (err) {
          console.warn("[Story/useSO] unsubscribe failed", err);
        }
      });
      orchRef.current = null;
      lastDraftRef.current = null;
      lastUserSeenKeyRef.current = null;
      gateRef.current.endEpoch();
      setReady(false);
    };
  }, [story, requirementsReady]);

  useEffect(() => {
    const orch = orchRef.current;
    if (!orch) return;
    if (!requirementsReady) return;
    if (!story?.basePreset) return;
    orch.setIntervalTurns(sanitizeIntervalTurns(intervalTurns));
  }, [intervalTurns, requirementsReady, story]);

  const activateIndex = useCallback((index: number) => {
    orchRef.current?.activateIndex(index);
  }, []);

  return { ready, activateIndex };
}

export default useStoryOrchestrator;
