import React, { createContext, useCallback, useEffect, useMemo, useState } from "react";
import { parseAndNormalizeStory, formatZodError, type NormalizedStory } from "@services/SchemaService/story-validator";
import { loadCheckpointBundle, type CheckpointBundle } from "@services/StoryService/story-loader";
import { useStoryRequirements } from "@hooks/useStoryRequirements";
import { useStoryOrchestrator } from "@hooks/useStoryOrchestrator";

type ValidationResult =
  | { ok: true; story: NormalizedStory }
  | { ok: false; errors: string[] };

type LoadOptions = { force?: boolean };
type CheckpointStatus = "pending" | "current" | "complete" | "failed";
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

  const { ready, activateIndex } = useStoryOrchestrator(story, requirementsReady);

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
          setCheckpointIndex(0);
          setCheckpointStatuses(
            (firstOk.json.checkpoints ?? []).map(function (_cp, i) {
              return i === 0 ? "current" : "pending";
            }),
          );
        } else {
          console.warn("[StoryContext] No valid story in bundle.");
        }
      } catch (err) {
        console.error("[StoryContext] Failed to load bundle", err);
      }
    })();
    return () => { cancelled = true; };
  }, [bundle, loadBundle]);

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
