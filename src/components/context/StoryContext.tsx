import React, { createContext, useCallback, useEffect, useMemo, useState } from "react";
import { parseAndNormalizeStory, formatZodError, type NormalizedStory } from "@services/SchemaService/story-validator";
import { loadCheckpointBundle, type CheckpointBundle } from "@services/StoryService/story-loader";
import { useStoryRequirements } from "@hooks/useStoryRequirements";
import { useStoryOrchestrator } from "@hooks/useStoryOrchestrator";
import { eventSource, event_types, getContext } from "@services/SillyTavernAPI";
import { subscribeToEventSource } from "@utils/eventSource";
import {
  DEFAULT_INTERVAL_TURNS,
  loadStoryState,
  persistStoryState,
  makeDefaultState,
  type CheckpointStatus,
} from "@services/StoryService/story-state";

type ValidationResult =
  | { ok: true; story: NormalizedStory }
  | { ok: false; errors: string[] };

type LoadOptions = { force?: boolean };
type CheckpointSummary = { id: string | number; name: string; objective: string; status: CheckpointStatus };

export interface StoryContextValue {
  validate: (input: unknown) => ValidationResult;
  loading: boolean;

  story?: NormalizedStory | null;
  title?: string;
  checkpoints: CheckpointSummary[];
  checkpointIndex: number;
  checkpointStatuses: CheckpointStatus[];
  activateCheckpoint: (i: number) => void;
  intervalTurns: number;
  setIntervalTurns: (value: number | ((prev: number) => number)) => void;
  activeChatId: string | null;
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
  const [title, setTitle] = useState<string>();
  const [story, setStory] = useState<NormalizedStory | null>(null);
  const [checkpointIndex, setCheckpointIndex] = useState(0);
  const [checkpointStatuses, setCheckpointStatuses] = useState<CheckpointStatus[]>([]);
  const [intervalTurns, setIntervalTurnsState] = useState<number>(DEFAULT_INTERVAL_TURNS);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const {
    requirementsReady,
    currentUserName,
    personaDefined,
    groupChatSelected,
    worldLorePresent,
    worldLoreMissing,
    requiredRolesPresent,
    missingRoles,
    onPersonaReload,
  } = useStoryRequirements(story);

  const { ready, activateIndex } = useStoryOrchestrator(story, requirementsReady, intervalTurns);

  const setIntervalTurns = useCallback((value: number | ((prev: number) => number)) => {
    setIntervalTurnsState((prev) => {
      const next = typeof value === "function" ? (value as (prev: number) => number)(prev) : value;
      if (!Number.isFinite(next)) return DEFAULT_INTERVAL_TURNS;
      const sanitized = Math.max(1, Math.floor(Number(next)));
      return sanitized;
    });
  }, []);

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
      } else {
        setBundle(null);
      }
      return res ?? null;
    } catch (e) {
      setBundle(null);
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
        } else {
          console.warn("[StoryContext] No valid story in bundle.");
        }
      } catch (err) {
        console.error("[StoryContext] Failed to load bundle", err);
      }
    })();
    return () => { cancelled = true; };
  }, [bundle, loadBundle]);

  useEffect(() => {

    const updateChatId = () => {
      try {
        const ctx = getContext();
        const raw = ctx?.chatId;
        console.log("[StoryContext] detected chatId", raw);

        const key = raw === null || raw === undefined ? null : String(raw).trim();
        setActiveChatId(key ? key : null);
      } catch (err) {
        console.warn("[StoryContext] Failed to resolve chatId", err);
        setActiveChatId(null);
      }
    };

    updateChatId();
    const unsubscribe = subscribeToEventSource({
      source: eventSource,
      eventName: event_types.CHAT_CHANGED,
      handler: updateChatId,
    });

    return () => {
      try {
        unsubscribe();
      } catch (err) {
        console.warn("[StoryContext] unsubscribe failed", err);
      }
    };
  }, []);

  useEffect(() => {
    if (!groupChatSelected) return;
    if (!story) {
      const defaults = makeDefaultState(story);
      setCheckpointIndex(defaults.checkpointIndex);
      setCheckpointStatuses(defaults.checkpointStatuses);
      setIntervalTurnsState(defaults.intervalTurns);
      setHydrated(false);
      return;
    }

    setHydrated(false);

    const loaded = loadStoryState({ chatId: activeChatId, story });
    setCheckpointIndex(loaded.state.checkpointIndex);
    setCheckpointStatuses(loaded.state.checkpointStatuses);
    setIntervalTurnsState(loaded.state.intervalTurns);
    activateIndex(loaded.state.checkpointIndex);
    setHydrated(true);

    console.log("[StoryContext] hydrated state", {
      chatId: activeChatId,
      source: loaded.source,
      checkpointIndex: loaded.state.checkpointIndex,
      intervalTurns: loaded.state.intervalTurns,
    });
  }, [story, activeChatId, activateIndex]);

  useEffect(() => {
    if (!hydrated) return;
    if (!story) return;

    persistStoryState({
      chatId: activeChatId,
      story,
      state: {
        checkpointIndex,
        checkpointStatuses,
        intervalTurns,
      },
    });
  }, [hydrated, story, activeChatId, checkpointIndex, checkpointStatuses, intervalTurns]);

  const activateCheckpoint = useCallback((i: number) => {
    activateIndex(i);
    setCheckpointIndex(i);
    setCheckpointStatuses(function (prev) {
      return (story?.checkpoints ?? []).map(function (_cp, idx) {
        if (idx < i) return "complete";
        if (idx === i) return "current";
        return prev[idx] ?? "pending";
      });
    });
  }, [activateIndex, story]);

  const checkpoints = useMemo<CheckpointSummary[]>(() => {
    if (!story) return [];
    return story.checkpoints.map(function (cp: any, idx: number) {
      const status = checkpointStatuses[idx]
        ?? (idx < checkpointIndex ? "complete" : idx === checkpointIndex ? "current" : "pending");
      return {
        id: cp.id,
        name: cp.name,
        objective: cp.objective,
        status,
      };
    });
  }, [story, checkpointStatuses, checkpointIndex]);

  return (
    <StoryContext.Provider value={{
      validate,
      loading,
      story,
      title,
      checkpoints,
      checkpointIndex,
      checkpointStatuses,
      activateCheckpoint,
      intervalTurns,
      setIntervalTurns,
      activeChatId,
      ready,
      requirementsReady,
      currentUserName,
      personaDefined,
      groupChatSelected,
      worldLorePresent,
      requiredRolesPresent,
      missingRoles,
      worldLoreMissing,
      onPersonaReload,
    }}>
      {children}
    </StoryContext.Provider>
  );
};

export default StoryContext;
