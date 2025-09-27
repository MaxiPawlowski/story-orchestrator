// useStoryOrchestrator.ts
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { eventSource, event_types, getCharacterNameById, chat } from '@services/SillyTavernAPI';
import { PresetService } from '@services/PresetService';
import { StoryOrchestrator } from '@services/Story/StoryOrchestrator';
import type { EvaluationDetails } from '@services/Story/types';
import type { Role } from '@services/SchemaService/story-schema';
import { useStoryContext } from '@components/context/StoryContext';
import type { NormalizedStory, NormalizedCheckpoint } from '@services/SchemaService/story-validator';

// --- tiny adapter: NormalizedStory -> slim orchestrator Story shape
function toSlimStory(ns: NormalizedStory) {
  return {
    title: ns.title,
    roles: ns.roles,
    on_start: ns.onStart,
    checkpoints: ns.checkpoints.map((cp: NormalizedCheckpoint) => ({
      id: cp.id,
      name: cp.name,
      objective: cp.objective,
      triggers: {
        win: cp.winTriggers ?? (cp as any).win_trigger ?? (cp as any).triggers?.win ?? [],
        fail: cp.failTriggers ?? (cp as any).fail_trigger ?? (cp as any).triggers?.fail ?? [],
      },
      onActivate: cp.onActivate,
    })),
  };
}

type UseOpts = {
  applyAuthorsNote?: (note: any) => void;
  applyWorldInfo?: (ops: any) => void;
  runAutomation?: (id: string) => Promise<void> | void;
  autoInit?: boolean;
};

type CheckpointStatus = 'pending' | 'current' | 'complete' | 'failed';
type CheckpointSummary = { id: string | number; name: string; objective: string; status: CheckpointStatus };




const pickUserTextFromChat = (): { text: string; key: string } | null => {
  // Walk from the tail for the latest user message
  if (!Array.isArray(chat) || chat.length === 0) return null;
  for (let i = chat.length - 1; i >= 0; i--) {
    const m = chat[i];
    const isUser = !!(m?.is_user || m?.isUser || m?.role === 'user');
    if (!isUser) continue;
    const text =
      (typeof m?.mes === 'string' && m.mes.trim()) ||
      (typeof m?.text === 'string' && m.text.trim()) ||
      (typeof m?.message === 'string' && m.message.trim()) ||
      (typeof m?.data?.text === 'string' && m.data.text.trim()) ||
      (typeof m?.data?.mes === 'string' && m.data.mes.trim()) ||
      '';
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
    this.lastRoleKey = null; // allow one role-apply per epoch
  }

  endEpoch() {
    this.lastRoleKey = null;
  }

  shouldAcceptUser(text: string, msgId?: string | number) {
    function hashish(x: unknown) {
      try { return JSON.stringify(x)?.slice(0, 200); } catch { return String(x); }
    }

    const sig = hashish([text.trim(), msgId]).toLowerCase();
    if (!text.trim()) return { accept: false, reason: 'empty' as const };
    if (sig && sig === this.lastUserSig) return { accept: false, reason: 'duplicate' as const };
    this.lastUserSig = sig;
    return { accept: true as const };
  }

  shouldApplyRole(role: Role, checkpointId: string | number) {
    const key = `${this.genEpoch}:${checkpointId}:${role}`;
    if (key === this.lastRoleKey) return false;
    this.lastRoleKey = key;
    return true;
  }
}

export function useStoryOrchestrator({
  applyAuthorsNote = () => { },
  applyWorldInfo = () => { },
  runAutomation,
  autoInit = true,
}: UseOpts) {
  const [ready, setReady] = useState(false);
  const [title, setTitle] = useState<string>();
  const [story, setStory] = useState<NormalizedStory | null>(null);
  const [checkpointIndex, setCheckpointIndex] = useState(0);
  const [checkpoint, setCheckpoint] = useState<any>(null);
  const [checkpointStatuses, setCheckpointStatuses] = useState<CheckpointStatus[]>([]);
  const [lastEvaluation, setLastEvaluation] = useState<EvaluationDetails | null>(null);
  const [evaluationHistory, setEvaluationHistory] = useState<EvaluationDetails[]>([]);

  const { loadBundle, bundle } = useStoryContext();
  const lastUserSeenKeyRef = useRef<string | null>(null);


  const orchRef = useRef<StoryOrchestrator | null>(null);
  const applyAuthorsNoteRef = useRef(applyAuthorsNote);
  const applyWorldInfoRef = useRef(applyWorldInfo);
  const runAutomationRef = useRef(runAutomation);
  const lastDraftRef = useRef<string | null>(null);
  const gateRef = useRef(new TurnGate());

  useEffect(() => { applyAuthorsNoteRef.current = applyAuthorsNote; }, [applyAuthorsNote]);
  useEffect(() => { applyWorldInfoRef.current = applyWorldInfo; }, [applyWorldInfo]);
  useEffect(() => { runAutomationRef.current = runAutomation; }, [runAutomation]);

  // Load first valid story from bundle
  useEffect(() => {
    if (!autoInit) return;
    let cancelled = false;
    (async () => {
      try {
        const activeBundle = bundle ?? (await loadBundle());
        if (cancelled) return;
        const firstOk = activeBundle?.results.find(
          (r): r is { file: string; ok: true; json: NormalizedStory } => r.ok,
        );
        if (firstOk?.json) {
          setStory(firstOk.json);
          setTitle(firstOk.json.title);
          setCheckpointIndex(0);
          setCheckpoint(firstOk.json.checkpoints?.[0] ?? null);
          setCheckpointStatuses(
            (firstOk.json.checkpoints ?? []).map((_cp, i) => (i === 0 ? 'current' : 'pending')),
          );
        } else {
          console.warn('[Story/useSO] No valid story in bundle.');
        }
      } catch (err) {
        console.error('[Story/useSO] Failed to load bundle', err);
      }
    })();
    return () => { cancelled = true; };
  }, [autoInit, bundle, loadBundle]);

  // Build orchestrator + wire events once per story
  useEffect(() => {
    if (!story?.basePreset || orchRef.current) return;

    const svc = new PresetService({
      base: story.basePreset.name ? { source: 'named', name: story.basePreset.name } : { source: 'current' },
      storyId: story.title, storyTitle: story.title, roleDefaults: story.roleDefaults,
    });

    const orch = new StoryOrchestrator({
      story: toSlimStory(story) as any,
      presetService: svc,
      applyAuthorsNote: (note) => applyAuthorsNoteRef.current?.(note),
      applyWorldInfo: (ops) => applyWorldInfoRef.current?.(ops),
      runAutomation: (id) => runAutomationRef.current?.(id),
      onRoleApplied: (role, cp) => console.log('[StoryOrch] role applied', { role, cp }),
      shouldApplyRole: (role: Role): boolean => gateRef.current.shouldApplyRole(role, orch.index()),
      setEvalHooks: (setters) => {
        setters.onEvaluated = (ev) => {
          console.log('[Story/useSO] onEvaluated', ev);
          setLastEvaluation(ev);
          setEvaluationHistory((h) => [...h, ev].slice(-50));
        };
      },
    });
    orchRef.current = orch;

    const offs: Array<() => void> = [];
    const on = (name: string, handler: (...args: any[]) => void) => {
      try {
        const off = eventSource?.on?.(name, handler);
        if (typeof off === 'function') offs.push(off);
        else if (eventSource?.off) offs.push(() => eventSource.off(name, handler));
      } catch (e) {
        console.warn('[Story/useSO] subscribe failed', name, e);
      }
    };
    const tryEmitLatestUserText = (gate: TurnGate, handle: (t: string) => void) => {
      // Read immediately; if empty or already seen, schedule a microtask and try once again.
      const fire = () => {
        const pick = pickUserTextFromChat();
        if (!pick) return false;
        if (pick.key === lastUserSeenKeyRef.current) return false; // already processed
        const ok = gate.shouldAcceptUser(pick.text, pick.key).accept;
        if (!ok) return false;
        lastUserSeenKeyRef.current = pick.key;
        console.log('[Story/useSO] pulled-from-chat', { key: pick.key, text: pick.text });
        handle(pick.text);
        return true;
      };
      if (fire()) return;
      queueMicrotask(() => { fire(); });        // 1st retry after chat mutates
      setTimeout(() => { fire(); }, 0);         // 2nd retry for slower paths
    };
    on(event_types?.MESSAGE_SENT, (payload: any, ...rest) => {
      // Log raw for visibility
      console.log('[Story/useSO] event', 'MESSAGE_SENT', payload, ...rest);



      tryEmitLatestUserText(gateRef.current, (t) => orch.handleUserText(t));
    });


    // DRAFTED SPEAKER (cache display name → role)
    on(event_types?.GROUP_MEMBER_DRAFTED, (raw: any) => {
      const chid = Array.isArray(raw) ? raw[0] : raw;
      const idNum = Number.parseInt(String(chid), 10);
      const name = Number.isFinite(idNum) && !Number.isNaN(idNum)
        ? getCharacterNameById?.(idNum)
        : (typeof raw?.name === 'string' ? raw.name : undefined);
      lastDraftRef.current = name ?? null;
    });


    on(event_types.GENERATION_STARTED, (payload: any) => {
      gateRef.current.newEpoch();
      let candidate = lastDraftRef.current ?? '';
      const p = Array.isArray(payload) ? payload[0] : payload;
      candidate ||= (p?.character && String(p.character)) || (p?.quietName && String(p.quietName)) || '';
      const stops: string[] = Array.isArray(p?.stop) ? p.stop
        : Array.isArray(p?.stopping_strings) ? p.stopping_strings : [];
      if (!candidate && stops.length) {
        const found = stops.find(s => /[:：]$/.test(s.trim()));
        if (found) candidate = found.replace(/\s*[:：]\s*$/, '').trim();
      }
      if (candidate) orch.setActiveRole(candidate);
    });
    on(event_types.GENERATION_STOPPED, gateRef.current.endEpoch);
    on(event_types.GENERATION_ENDED, () => { lastDraftRef.current = null; gateRef.current.endEpoch(); });

    (async () => { if (autoInit) await orch.init(); setReady(true); })();

    return () => { offs.forEach((off) => { try { off(); } catch { } }); orchRef.current = null; };
  }, [story, autoInit]);

  const activateCheckpoint = useCallback((i: number) => {
    orchRef.current?.activateIndex(i);
    setCheckpointIndex(i);
    setCheckpoint((story as any)?.checkpoints?.[i] ?? null);
    setCheckpointStatuses((prev) =>
      (story?.checkpoints ?? []).map((_cp, idx) =>
        idx < i ? 'complete' : idx === i ? 'current' : prev[idx] ?? 'pending',
      ),
    );
  }, [story]);

  const checkpoints = useMemo<CheckpointSummary[]>(() => {
    if (!story) return [];
    return story.checkpoints.map((cp: any, idx: number) => ({
      id: cp.id,
      name: cp.name,
      objective: cp.objective,
      status:
        checkpointStatuses[idx] ??
        (idx < checkpointIndex ? 'complete' : idx === checkpointIndex ? 'current' : 'pending'),
    }));
  }, [story, checkpointStatuses, checkpointIndex]);

  const progressText = useMemo(() => {
    if (!story) return '';
    return story.checkpoints.map((cp: any, i: number) => {
      const status = checkpointStatuses[i] ??
        (i < checkpointIndex ? 'complete' : i === checkpointIndex ? 'current' : 'pending');
      const prefix = status === 'complete' ? '[x] ' : status === 'current' ? '[>] ' : status === 'failed' ? '[!] ' : '[ ] ';
      return `${prefix}${cp.name}`;
    }).join('  |  ');
  }, [story, checkpointStatuses, checkpointIndex]);

  return {
    ready, title, checkpointIndex, checkpoint,
    checkpoints, checkpointStatuses, lastEvaluation, evaluationHistory,
    progressText, activateCheckpoint,
  };
}
