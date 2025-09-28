import React, { createContext, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { parseAndNormalizeStory, formatZodError, type NormalizedStory } from "@services/SchemaService/story-validator";
import { loadCheckpointBundle, type CheckpointBundle } from "@services/StoryService/story-loader";
import { eventSource, event_types, getCharacterNameById, getCharacterIdByName, chat, getContext, getWorldInfoSettings } from '@services/SillyTavernAPI';
import { PresetService } from '@services/PresetService';
import type { Role } from '@services/SchemaService/story-schema';
import { StoryOrchestrator } from '@services/StoryService/StoryOrchestrator';
type ValidationResult =
  | { ok: true; story: NormalizedStory }
  | { ok: false; errors: string[] };

type LoadOptions = { force?: boolean };
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
    this.lastRoleKey = null;
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

export interface StoryContextValue {
  validate: (input: unknown) => ValidationResult;
  loading: boolean;

  story?: NormalizedStory | null;
  title?: string;
  checkpoints: CheckpointSummary[];
  checkpointIndex: number;
  checkpointStatuses: CheckpointStatus[];
  activateCheckpoint: (i: number) => void;
  ready: boolean;
  requirementsReady: boolean;
  currentUserName: string;
  personaDefined: boolean;
  groupChatSelected: boolean;
  worldLorePresent: boolean;
  worldLoreMissing: string[];
  requiredRolesPresent: boolean;
  missingRoles: string[];
  onPersonaReload: () => Promise<void> | void;
}

const StoryContext = createContext<StoryContextValue | undefined>(undefined);

export const StoryProvider: React.FC<React.PropsWithChildren<{}>> = ({ children }) => {
  const [loading, setLoading] = useState(false);
  const [bundle, setBundle] = useState<CheckpointBundle | null>(null);
  const [loadedResult, setLoadedResult] = useState<{ file: string; ok: boolean; json?: NormalizedStory; error?: unknown } | null>(null);

  const [ready, setReady] = useState(false);
  const [title, setTitle] = useState<string>();
  const [story, setStory] = useState<NormalizedStory | null>(null);
  const [checkpointIndex, setCheckpointIndex] = useState(0);
  const [checkpoint, setCheckpoint] = useState<any>(null);
  const [checkpointStatuses, setCheckpointStatuses] = useState<CheckpointStatus[]>([]);
  const lastUserSeenKeyRef = useRef<string | null>(null);
  const orchRef = useRef<StoryOrchestrator | null>(null);
  const lastDraftRef = useRef<string | null>(null);
  const gateRef = useRef(new TurnGate());
  // requirement / status state (extracted from Requirements component)
  const [currentUserName, setCurrentUserName] = useState<string>("");
  // store meaningful flags; color mapping belongs to the UI components
  const [personaDefined, setPersonaDefined] = useState<boolean>(true);
  const [groupChatSelected, setGroupChatSelected] = useState<boolean>(false);
  const [worldLorePresent, setWorldLorePresent] = useState<boolean>(true);
  const [worldLoreMissing, setWorldLoreMissing] = useState<string[]>([]);
  const [requiredRolesPresent, setRequiredRolesPresent] = useState<boolean>(false);
  const [missingRoles, setMissingRoles] = useState<string[]>([]);

  const requiredWorldInfoKeys = useMemo(() => {
    if (!story) return [];
    const keys = new Set<string>();
    story.checkpoints.forEach((cp) => {
      const wi = cp.onActivate?.world_info;
      if (wi === undefined || wi === null) return;
      const push = (list?: string[]) => {
        if (!Array.isArray(list)) return;
        list.forEach((name) => {
          if (typeof name === "string" && name.trim()) keys.add(name.trim());
        });
      };
      push(wi.activate);
      push(wi.deactivate);
      push(wi.make_constant);
    });
    return Array.from(keys);
  }, [story]);

  const handlePersonaReload = useCallback(async () => {
    try {
      const { name1 } = getContext();
      setCurrentUserName(name1 ?? "");
      setPersonaDefined(Boolean(name1));
    } catch (e) {
      console.warn('[StoryContext] onPersonaReload failed', e);
      setCurrentUserName("");
      setPersonaDefined(false);
    }
  }, []);

  const refreshRoles = useCallback(() => {
    if (!story || !story.roles) {
      setMissingRoles([]);
      setRequiredRolesPresent(true);
      return;
    }
    try {
      const roles = story.roles as Partial<Record<Role, string>>;
      const requiredNames = Object.values(roles)
        .filter((name): name is string => typeof name === "string" && name.trim().length > 0)
        .map((name) => name.trim());
      if (requiredNames.length === 0) {
        setMissingRoles([]);
        setRequiredRolesPresent(true);
        return;
      }
      const missing: string[] = [];
      for (const name of requiredNames) {
        const id = typeof getCharacterIdByName === "function" ? getCharacterIdByName(name) : undefined;
        if (id === undefined) missing.push(name);
      }
      setMissingRoles(missing);
      setRequiredRolesPresent(missing.length === 0);
    } catch (e) {
      console.warn('[StoryContext] role validation failed', e);
      setMissingRoles([]);
      setRequiredRolesPresent(false);
    }
  }, [story]);

  const refreshWorldLore = useCallback(() => {
    if (!requiredWorldInfoKeys.length) {
      setWorldLorePresent(true);
      return;
    }
    try {
      const settings = typeof getWorldInfoSettings === "function" ? getWorldInfoSettings() : null;
      if (!settings || !settings.world_info) {
        setWorldLorePresent(false);
        return;
      }
      const seen = new Set<string>();
      const stack: any[] = [settings.world_info];
      const visited = new Set<any>();
      while (stack.length) {
        const current = stack.pop();
        if (!current || visited.has(current)) continue;
        visited.add(current);
        if (Array.isArray(current)) {
          current.forEach((item) => stack.push(item));
          continue;
        }
        if (typeof current === 'object') {
          const entry: any = current;
          if (typeof entry.title === 'string' && entry.title.trim()) {
            seen.add(entry.title.trim().toLowerCase());
          }
          if (Array.isArray(entry.keys)) {
            entry.keys.forEach((key: any) => {
              if (typeof key === 'string' && key.trim()) {
                seen.add(key.trim().toLowerCase());
              }
            });
          }
          if (entry.id !== undefined && entry.id !== null) {
            seen.add(String(entry.id).trim().toLowerCase());
          }
          for (const value of Object.values(entry)) {
            if (value && (Array.isArray(value) || typeof value === 'object')) {
              stack.push(value);
            }
          }
        }
      }
      const missing = requiredWorldInfoKeys.filter(
        (name) => !seen.has(name.trim().toLowerCase()),
      );
      setWorldLorePresent(missing.length === 0);
      setWorldLoreMissing(missing);
    } catch (e) {
      console.warn('[StoryContext] world lore validation failed', e);
      setWorldLorePresent(false);
      setWorldLoreMissing([]);
    }
  }, [requiredWorldInfoKeys]);

  const requirementsReady = useMemo(() => (
    Boolean(story && personaDefined && groupChatSelected && requiredRolesPresent && worldLorePresent)
  ), [story, personaDefined, groupChatSelected, requiredRolesPresent, worldLorePresent]);


  const validate = useCallback((input: unknown): ValidationResult => {
    try {
      const normalized = parseAndNormalizeStory(input);
      const res: ValidationResult = { ok: true, story: normalized };
      return res;
    } catch (e) {
      const errors = formatZodError(e);
      const res: ValidationResult = { ok: false, errors };
      return res;
    }
  }, []);

  const loadBundle = useCallback(async (options?: LoadOptions): Promise<CheckpointBundle | null> => {
    setLoading(true);
    try {
      const res = await loadCheckpointBundle(options ?? {});
      if (res) {
        setBundle(res);
        // only keep the first result (single JSON load)
        if (res.results && res.results.length > 0) {
          const r = res.results[0];
          setLoadedResult(r.ok ? { file: r.file, ok: true, json: r.json } : { file: r.file, ok: false, error: r.error });
        } else {
          setLoadedResult(null);
        }
      } else {
        setBundle(null);
        setLoadedResult(null);
      }
      return res ?? null;
    } catch (e) {
      setBundle(null);
      setLoadedResult(null);
      console.error("[StoryContext] loadBundle failed:", e);
    } finally {
      setLoading(false);
    }
    return null;
  }, []);

  useEffect(() => {
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
  }, [bundle, loadBundle]);

  // persona / chat status handling (extracted from Requirements component)
  useEffect(() => {
    const listeners: Array<() => void> = [];

    const subscribe = (eventName: string, handler: (...args: any[]) => void) => {
      try {
        const off = eventSource?.on?.(eventName, handler);
        if (typeof off === 'function') {
          listeners.push(off);
        } else if (eventSource?.off) {
          listeners.push(() => eventSource.off(eventName, handler));
        } else if ((eventSource as any)?.removeListener) {
          listeners.push(() => (eventSource as any).removeListener(eventName, handler));
        }
      } catch (e) {
        console.warn('[StoryContext] subscribe failed', eventName, e);
      }
    };

    const onChatChanged = async () => {
      try {
        const { groupId } = getContext();
        setGroupChatSelected(Boolean(groupId));
      } catch (e) {
        console.warn('[StoryContext] onChatChanged failed', e);
        setGroupChatSelected(false);
      }
      await handlePersonaReload();
      refreshRoles();
    };

    const onWorldInfoEvent = () => {
      refreshWorldLore();
    };

    subscribe(event_types.CHAT_CHANGED, onChatChanged);
    subscribe(event_types.WORLDINFO_UPDATED, onWorldInfoEvent);
    subscribe(event_types.WORLDINFO_SETTINGS_UPDATED, onWorldInfoEvent);
    subscribe(event_types.WORLDINFO_ENTRIES_LOADED, onWorldInfoEvent);

    // initial probe
    onChatChanged();
    refreshWorldLore();

    return () => {
      listeners.forEach((off) => {
        try { off(); } catch (err) { console.warn('[StoryContext] unsubscribe failed', err); }
      });
    };
  }, [handlePersonaReload, refreshRoles, refreshWorldLore]);

  useEffect(() => {
    if (!story?.basePreset || !requirementsReady) {
      setReady(false);
      return;
    }

    const svc = new PresetService({
      base: story.basePreset.name ? { source: 'named', name: story.basePreset.name } : { source: 'current' },
      storyId: story.title, storyTitle: story.title, roleDefaults: story.roleDefaults,
    });

    const orch = new StoryOrchestrator({
      story,
      presetService: svc,
      onRoleApplied: (role, cp) => console.log('[StoryOrch] role applied', { role, cp }),
      shouldApplyRole: (role: Role): boolean => gateRef.current.shouldApplyRole(role, orch.index()),
      setEvalHooks: (setters) => { setters.onEvaluated = (ev) => console.log('[Story/useSO] onEvaluated', ev); },
    });
    orchRef.current = orch;
    lastUserSeenKeyRef.current = null;
    lastDraftRef.current = null;
    gateRef.current.endEpoch();

    const offs: Array<() => void> = [];
    const subscribe = (name: string, handler: (...args: any[]) => void) => {
      try {
        const off = eventSource?.on?.(name, handler);
        if (typeof off === 'function') {
          offs.push(off);
        } else if (eventSource?.off) {
          offs.push(() => eventSource.off(name, handler));
        }
      } catch (e) {
        console.warn('[Story/useSO] subscribe failed', name, e);
      }
    };

    subscribe(event_types.MESSAGE_SENT, (payload: any, ...rest) => {
      console.log('[Story/useSO] event', 'MESSAGE_SENT', payload, ...rest);
      const fire = () => {
        const pick = pickUserTextFromChat();
        if (!pick) return false;
        if (pick.key === lastUserSeenKeyRef.current) return false;
        const ok = gateRef.current.shouldAcceptUser(pick.text, pick.key).accept;
        if (!ok) return false;
        lastUserSeenKeyRef.current = pick.key;
        console.log('[Story/useSO] pulled-from-chat', { key: pick.key, text: pick.text });
        orch.handleUserText(pick.text);
        return true;
      };
      if (fire()) return;
      queueMicrotask(() => { fire(); });
      setTimeout(() => { fire(); }, 0);
    });

    subscribe(event_types.GROUP_MEMBER_DRAFTED, (raw: any) => {
      const chid = Array.isArray(raw) ? raw[0] : raw;
      const idNum = Number.parseInt(String(chid), 10);
      const name = Number.isFinite(idNum) && !Number.isNaN(idNum)
        ? getCharacterNameById?.(idNum)
        : (typeof raw?.name === 'string' ? raw.name : undefined);
      lastDraftRef.current = name ?? null;
      console.log('[Story/useSO] Event', 'GROUP_MEMBER_DRAFTED', raw, '->', lastDraftRef.current);
    });

    subscribe(event_types.GENERATION_STARTED, (payload: any) => {
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
    subscribe(event_types.GENERATION_STOPPED, () => {
      gateRef.current.endEpoch();
    });
    subscribe(event_types.GENERATION_ENDED, () => {
      lastDraftRef.current = null;
      gateRef.current.endEpoch();
    });

    (async () => {
      await orch.init();
      setReady(true);
    })();

    return () => {
      offs.forEach((off) => {
        try { off(); } catch (err) { console.warn('[Story/useSO] unsubscribe failed', err); }
      });
      orchRef.current = null;
      lastDraftRef.current = null;
      lastUserSeenKeyRef.current = null;
      gateRef.current.endEpoch();
      setReady(false);
    };
  }, [story, requirementsReady]);


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

  return (
    <StoryContext.Provider value={{
      validate, loading, story, title, checkpoints, checkpointIndex, checkpointStatuses, activateCheckpoint, ready,
      requirementsReady,
      currentUserName, personaDefined, groupChatSelected, worldLorePresent,
      requiredRolesPresent, missingRoles, worldLoreMissing,
      onPersonaReload: handlePersonaReload,
    }}>
      {children}
    </StoryContext.Provider>
  );
};

export default StoryContext;
