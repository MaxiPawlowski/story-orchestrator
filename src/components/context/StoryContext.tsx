import React, { createContext, useCallback, useEffect, useMemo, useState } from "react";
import { parseAndNormalizeStory, formatZodError, type NormalizedStory } from "@utils/story-validator";
import { loadCheckpointBundle, type CheckpointBundle } from "@utils/story-loader";
import { useStoryOrchestrator } from "@hooks/useStoryOrchestrator";
import { eventSource, event_types, getContext } from "@services/SillyTavernAPI";
import { subscribeToEventSource } from "@utils/eventSource";
import {
  DEFAULT_INTERVAL_TURNS,
  deriveCheckpointStatuses,
  CheckpointStatus,
} from "@utils/story-state";

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
  activateCheckpoint: (i: number) => void;
  turnsSinceEval: number;
  activeChatId: string | null;
  ready: boolean;
  requirementsReady: boolean;
  currentUserName: string;
  personaDefined: boolean;
  groupChatSelected: boolean;
  worldLoreEntriesPresent: boolean;
  worldLoreEntriesMissing: string[];
  globalLoreBookPresent: boolean;
  globalLoreBookMissing: string[];
  missingGroupMembers: string[];
  onPersonaReload: () => Promise<void> | void;
}

const StoryContext = createContext<StoryContextValue | undefined>(undefined);

export const StoryProvider: React.FC<React.PropsWithChildren<{}>> = ({ children }) => {
  const [loading, setLoading] = useState(false);
  const [bundle, setBundle] = useState<CheckpointBundle | null>(null);
  const [title, setTitle] = useState<string>();
  const [story, setStory] = useState<NormalizedStory | null>(null);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  const { ready, activateIndex, requirements, runtime, reloadPersona, updateCheckpointStatus } = useStoryOrchestrator(
    story,
    DEFAULT_INTERVAL_TURNS,
    {
      onEvaluated: ({ outcome, cpIndex }) => {
        if (!story) return;
        if (outcome === "win") {
          const next = cpIndex + 1;
          updateCheckpointStatus(cpIndex, "complete");
          if (next < (story.checkpoints?.length ?? 0)) {
            activateIndex(next);
          }
        } else if (outcome === "fail") {
          updateCheckpointStatus(cpIndex, CheckpointStatus.Failed);
        }
      },
    },
  );

  const {
    requirementsReady,
    currentUserName,
    personaDefined,
    groupChatSelected,
    missingGroupMembers,
    worldLoreEntriesPresent,
    worldLoreEntriesMissing,
    globalLoreBookPresent,
    globalLoreBookMissing,
  } = requirements;

  const { checkpointIndex, turnsSinceEval, checkpointStatusMap } = runtime;

  const activateCheckpoint = useCallback((i: number) => {
    activateIndex(i);
  }, [activateIndex]);

  const validate = useCallback((input: unknown): ValidationResult => {
    try {
      const normalized = parseAndNormalizeStory(input);
      return { ok: true, story: normalized };
    } catch (e) {
      const errors = formatZodError(e);
      return { ok: false, errors };
    }
  }, []);

  const loadBundle = useCallback(async (options?: LoadOptions): Promise<CheckpointBundle | null> => {
    setLoading(true);
    try {
      const res = await loadCheckpointBundle(options ?? {});
      setBundle(res ?? null);
      return res ?? null;
    } catch (e) {
      setBundle(null);
      console.error("[StoryContext] loadBundle failed:", e);
    } finally {
      setLoading(false);
    }
    return null;
  }, []);

  const refreshBundle = useCallback(async () => {
    const res = await loadBundle({ force: true });
    if (!res) {
      setStory(null);
      setTitle(undefined);
      return;
    }
    const firstOk = res.results.find(
      (r): r is { file: string; ok: true; json: NormalizedStory } => r.ok,
    );
    if (firstOk?.json) {
      setStory(firstOk.json);
      setTitle(firstOk.json.title);
    } else {
      setStory(null);
      setTitle(undefined);
    }
  }, [loadBundle]);


  useEffect(() => {
    const updateChatId = () => {
      try {
        const ctx = getContext();
        const raw = ctx?.chatId;
        const groupId = ctx?.groupId;

        if (!groupId) return;
        console.log("[StoryContext] detected chatId", raw);

        const key = raw === null || raw === undefined ? null : String(raw).trim();
        setActiveChatId(key ? key : null);

        if (!story) {
          try {
            refreshBundle();
          } catch (err) {
            console.error("[StoryContext] attemptLoad failed", err);
          }
        }
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
  }, [story, refreshBundle]);


  const checkpoints = useMemo<CheckpointSummary[]>(() => {
    if (!story) return [];
    const statuses = deriveCheckpointStatuses(story, { checkpointIndex, checkpointStatusMap });
    return story.checkpoints.map((cp, idx) => {
      const status = statuses[idx]
        ?? (idx < checkpointIndex
          ? CheckpointStatus.Complete
          : idx === checkpointIndex
            ? CheckpointStatus.Current
            : CheckpointStatus.Pending);
      return {
        id: cp.id,
        name: cp.name,
        objective: cp.objective,
        status,
      };
    });
  }, [story, checkpointIndex, checkpointStatusMap]);

  return (
    <StoryContext.Provider value={{
      validate,
      loading,
      story,
      title,
      checkpoints,
      checkpointIndex,
      activateCheckpoint,
      turnsSinceEval,
      activeChatId,
      ready,
      requirementsReady,
      currentUserName,
      personaDefined,
      groupChatSelected,
      missingGroupMembers,
      worldLoreEntriesPresent,
      worldLoreEntriesMissing,
      globalLoreBookPresent,
      globalLoreBookMissing,
      onPersonaReload: reloadPersona,
    }}>
      {children}
    </StoryContext.Provider>
  );
};

export default StoryContext;
