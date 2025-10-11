import React, { createContext, useCallback, useEffect, useMemo, useState } from "react";
import { useExtensionSettings } from "@components/context/ExtensionSettingsContext";
import { parseAndNormalizeStory, formatZodError, type NormalizedStory } from "@utils/story-validator";
import type { Story } from "@utils/story-schema";
import { loadCheckpointBundle, type CheckpointBundle } from "@utils/story-loader";
import { clearNumericJsonBundleCache } from "@utils/json-bundle-loader";
import { useStoryOrchestrator } from "@hooks/useStoryOrchestrator";
import { eventSource, event_types, getContext } from "@services/SillyTavernAPI";
import { subscribeToEventSource } from "@utils/eventSource";
import {
  DEFAULT_INTERVAL_TURNS,
  deriveCheckpointStatuses,
  CheckpointStatus,
} from "@utils/story-state";
import { saveStoryFile as persistStoryFile, type SaveStoryFileResponse } from "@services/StoryFileService";

type ValidationResult =
  | { ok: true; story: NormalizedStory }
  | { ok: false; errors: string[] };

type LoadOptions = { force?: boolean };
type CheckpointSummary = { id: string; name: string; objective: string; status: CheckpointStatus };
export type StoryFileDescriptor = { name: string; ok: boolean; error?: string };
export type SaveStoryResult = SaveStoryFileResponse;

export interface StoryContextValue {
  validate: (input: unknown) => ValidationResult;
  applyStory: (input: Story) => ValidationResult;
  loading: boolean;

  story?: NormalizedStory | null;
  title?: string;
  storyFiles: StoryFileDescriptor[];
  selectedStoryFile: string | null;
  selectedStoryError: string | null;
  selectStoryFile: (file: string) => void;
  reloadStories: (file?: string | null) => Promise<void>;
  saveStoryToFile: (file: string, story: Story, options?: { overwrite?: boolean }) => Promise<SaveStoryResult>;
  checkpoints: CheckpointSummary[];
  checkpointIndex: number;
  activeCheckpointKey: string | null;
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
  const [selectedStoryFile, setSelectedStoryFile] = useState<string | null>(null);
  const [selectedStoryError, setSelectedStoryError] = useState<string | null>(null);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  const describeBundleError = useCallback((error: unknown): string => {
    try {
      const formatted = formatZodError(error);
      if (Array.isArray(formatted) && formatted.length) {
        return formatted.join("; ");
      }
    } catch {
      // ignore, fall back to other formats
    }
    if (error instanceof Error) {
      return error.message;
    }
    if (Array.isArray(error)) {
      return error.map((entry) => String(entry)).join("; ");
    }
    if (typeof error === "string") {
      return error;
    }
    try {
      return JSON.stringify(error);
    } catch {
      return "Unknown validation error";
    }
  }, []);

  const storyFiles = useMemo<StoryFileDescriptor[]>(() => {
    if (!bundle) return [];
    return bundle.results.map((entry) => ({
      name: entry.file,
      ok: entry.ok,
      error: entry.ok ? undefined : describeBundleError(entry.error),
    }));
  }, [bundle, describeBundleError]);

  const applyBundleSelection = useCallback((res: CheckpointBundle | null, preferredFile?: string | null) => {
    if (!res || !res.results.length) {
      setSelectedStoryFile(null);
      setStory(null);
      setTitle(undefined);
      setSelectedStoryError(null);
      return;
    }

    let targetFile: string | null = null;
    if (preferredFile && res.results.some((entry) => entry.file === preferredFile)) {
      targetFile = preferredFile;
    } else {
      const firstOk = res.results.find((entry) => entry.ok);
      targetFile = firstOk?.file ?? res.results[0].file;
    }

    setSelectedStoryFile(targetFile);

    const targetEntry = res.results.find((entry) => entry.file === targetFile);
    if (targetEntry && targetEntry.ok) {
      setStory(targetEntry.json);
      setTitle(targetEntry.json.title);
      setSelectedStoryError(null);
    } else {
      setStory(null);
      setTitle(undefined);
      setSelectedStoryError(targetEntry ? describeBundleError(targetEntry.error) : null);
    }
  }, [describeBundleError]);

  const { arbiterFrequency, arbiterPrompt } = useExtensionSettings();
  const intervalTurns = Number.isFinite(arbiterFrequency) ? arbiterFrequency : DEFAULT_INTERVAL_TURNS;

  const { ready, activateIndex, requirements, runtime, reloadPersona, updateCheckpointStatus } = useStoryOrchestrator(
    story,
    intervalTurns,
    {
      onEvaluated: ({ outcome, cpIndex, transition }) => {
        if (!story) return;
        if (outcome === "win") {
          updateCheckpointStatus(cpIndex, "complete");
          if (transition && transition.outcome === "win") {
            const nextIndex = transition.targetIndex;
            if (Number.isFinite(nextIndex) && nextIndex >= 0 && nextIndex < (story.checkpoints?.length ?? 0) && nextIndex !== cpIndex) {
              activateIndex(nextIndex);
            }
          }
        } else if (outcome === "fail") {
          updateCheckpointStatus(cpIndex, CheckpointStatus.Failed);
          if (transition && transition.outcome === "fail") {
            const nextIndex = transition.targetIndex;
            if (Number.isFinite(nextIndex) && nextIndex >= 0 && nextIndex < (story.checkpoints?.length ?? 0) && nextIndex !== cpIndex) {
              activateIndex(nextIndex);
            }
          }
        }
      },
      arbiterPrompt,
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

  const { checkpointIndex, activeCheckpointKey, turnsSinceEval, checkpointStatusMap } = runtime;

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

  const applyStory = useCallback((input: Story): ValidationResult => {
    try {
      const normalized = parseAndNormalizeStory(input);
      setStory(normalized);
      setTitle(normalized.title);
      setSelectedStoryError(null);
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

  const refreshBundle = useCallback(async (preferredFile?: string | null) => {
    clearNumericJsonBundleCache("story-checkpoints");
    const res = await loadBundle({ force: true });
    applyBundleSelection(res ?? null, preferredFile ?? selectedStoryFile ?? null);
  }, [applyBundleSelection, loadBundle, selectedStoryFile]);

  const selectStoryFile = useCallback((file: string) => {
    if (!bundle) return;
    applyBundleSelection(bundle, file);
  }, [applyBundleSelection, bundle]);

  const saveStoryToFile = useCallback(async (file: string, input: Story, options?: { overwrite?: boolean }) => {
    const result = await persistStoryFile(file, input, { overwrite: options?.overwrite });
    if (result.ok) {
      await refreshBundle(result.fileName);
    }
    return result;
  }, [refreshBundle]);


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
    const statuses = deriveCheckpointStatuses(story, { checkpointIndex, activeCheckpointKey, checkpointStatusMap });
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
  }, [story, checkpointIndex, activeCheckpointKey, checkpointStatusMap]);

  return (
    <StoryContext.Provider value={{
      validate,
      applyStory,
      loading,
      story,
      title,
      storyFiles,
      selectedStoryFile,
      selectedStoryError,
      selectStoryFile,
      reloadStories: refreshBundle,
      saveStoryToFile,
      checkpoints,
      checkpointIndex,
      activeCheckpointKey,
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
