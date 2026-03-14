import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEventHandler, Dispatch, SetStateAction } from "react";
import yaml from "yaml";
import type { Story } from "@utils/story-schema";
import type { NormalizedStory } from "@utils/story-validator";
import {
  normalizedToDraft,
  type StoryDraft,
  type StudioDiagnostic,
  type StudioDraftValidationResult,
  slugify,
  validateStudioDraft,
} from "@utils/checkpoint-studio";
import type { DeleteLibraryStoryResult, SaveLibraryStoryResult, StoryLibraryEntry } from "@components/context/StoryContext";

type ValidationResult = { ok: true; story: NormalizedStory } | { ok: false; errors: string[] };
type Feedback = { type: "success" | "error"; message: string };

type UseStudioActionsArgs = {
  baseDraft: StoryDraft;
  draft: StoryDraft;
  setDraft: Dispatch<SetStateAction<StoryDraft>>;
  setSelectedId: Dispatch<SetStateAction<string | null>>;
  validate: (input: unknown) => ValidationResult;
  currentEntry: StoryLibraryEntry | null;
  suggestedName: string;
  disabled?: boolean;
  onSelectKey: (key: string) => void;
  onSaveStory: (story: Story, options?: { targetKey?: string; name?: string }) => Promise<SaveLibraryStoryResult>;
  onDeleteStory: (key: string) => Promise<DeleteLibraryStoryResult>;
};

const EMPTY_DIAGNOSTICS: StudioDiagnostic[] = [];

const getDraftValidationMessage = (result: StudioDraftValidationResult, prefix: string): string => {
  if (result.ok) return "";
  return result.stage === "conversion" ? `${prefix}: ${result.error}` : result.error;
};

const getImportedStoryName = (fileName: string, storyTitle?: string): string => {
  const baseFileName = fileName.replace(/\.[^/.]+$/, "");
  return storyTitle?.trim() || baseFileName || "Imported Story";
};

export const useStudioActions = ({
  baseDraft,
  draft,
  setDraft,
  setSelectedId,
  validate,
  currentEntry,
  suggestedName,
  disabled,
  onSelectKey,
  onSaveStory,
  onDeleteStory,
}: UseStudioActionsArgs) => {
  const [diagnostics, setDiagnostics] = useState<StudioDiagnostic[]>([]);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [savePending, setSavePending] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const setActionFeedback = useCallback((nextFeedback: Feedback | null) => {
    setFeedback(nextFeedback);
  }, []);

  const setValidationFeedback = useCallback((nextFeedback: Feedback | null, nextDiagnostics: StudioDiagnostic[]) => {
    setFeedback(nextFeedback);
    setDiagnostics(nextDiagnostics);
  }, []);

  const clearValidationFeedback = useCallback(() => {
    setValidationFeedback(null, EMPTY_DIAGNOSTICS);
  }, [setValidationFeedback]);

  const applyDraftSelection = useCallback((nextDraft: StoryDraft) => {
    setDraft(nextDraft);
    setSelectedId(nextDraft.start || nextDraft.checkpoints[0]?.id || null);
  }, [setDraft, setSelectedId]);

  const showDraftValidationError = useCallback((
    result: Extract<StudioDraftValidationResult, { ok: false }>,
    getMessage: (validation: Extract<StudioDraftValidationResult, { ok: false }>) => string,
  ) => {
    setValidationFeedback(
      { type: "error", message: getMessage(result) },
      result.diagnostics,
    );
  }, [setValidationFeedback]);

  const validateDraftForAction = useCallback((getMessage: (validation: Extract<StudioDraftValidationResult, { ok: false }>) => string) => {
    const result = validateStudioDraft(draft, validate);
    if (!result.ok) {
      showDraftValidationError(result, getMessage);
      return null;
    }
    return result;
  }, [draft, validate, showDraftValidationError]);

  const runDiagnostics = useCallback((input: StoryDraft) => {
    setDiagnostics(validateStudioDraft(input, validate).diagnostics);
  }, [validate]);

  const persistValidatedDraft = useCallback(async ({
    result,
    options,
    successMessage,
  }: {
    result: Extract<StudioDraftValidationResult, { ok: true }>;
    options: Parameters<typeof onSaveStory>[1];
    successMessage: string;
  }) => {
    setSavePending(true);
    clearValidationFeedback();
    try {
      const saveResult = await onSaveStory(result.story, options);
      if (!saveResult.ok) {
        setActionFeedback({ type: "error", message: saveResult.error });
        return false;
      }
      onSelectKey(saveResult.key);
      setActionFeedback({ type: "success", message: successMessage });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setActionFeedback({ type: "error", message });
      return false;
    } finally {
      setSavePending(false);
    }
  }, [clearValidationFeedback, onSaveStory, onSelectKey, setActionFeedback]);

  useEffect(() => {
    runDiagnostics(baseDraft);
  }, [baseDraft, runDiagnostics]);

  const handleSave = useCallback(async () => {
    if (disabled) return;
    if (!currentEntry || currentEntry.kind !== "saved") {
      setActionFeedback({ type: "error", message: "Select a saved story before using Save. Try Save As to create a copy." });
      return;
    }

    const result = validateDraftForAction((validation) => getDraftValidationMessage(validation, "Story data is incomplete"));
    if (!result) return;

    const label = typeof currentEntry.meta?.name === "string" ? currentEntry.meta.name : "story";
    await persistValidatedDraft({
      result,
      options: {
        targetKey: currentEntry.key,
        name: typeof currentEntry.meta?.name === "string" ? currentEntry.meta.name : undefined,
      },
      successMessage: `Saved ${label}`,
    });
  }, [currentEntry, disabled, persistValidatedDraft, setActionFeedback, validateDraftForAction]);

  const handleSaveAs = useCallback(async () => {
    if (disabled) return;

    const result = validateDraftForAction((validation) => getDraftValidationMessage(validation, "Story data is incomplete"));
    if (!result) return;

    const input = typeof window !== "undefined"
      ? window.prompt("Enter a name for the saved story", suggestedName)
      : null;
    if (input === null) return;

    const candidate = input.trim();
    if (!candidate) return;

    await persistValidatedDraft({
      result,
      options: { name: candidate },
      successMessage: `Saved ${candidate}`,
    });
  }, [disabled, persistValidatedDraft, suggestedName, validateDraftForAction]);

  const handleDeleteStory = useCallback(async () => {
    if (disabled) return;
    if (!currentEntry) {
      setActionFeedback({ type: "error", message: "Select a saved story to delete." });
      return;
    }
    if (currentEntry.kind !== "saved") {
      setActionFeedback({ type: "error", message: "Only saved stories can be deleted." });
      return;
    }

    const label = typeof currentEntry.meta?.name === "string" && currentEntry.meta.name.trim().length
      ? currentEntry.meta.name.trim()
      : "saved story";
    const confirmed = typeof window === "undefined"
      ? true
      : window.confirm(`Delete ${label}? This action cannot be undone.`);
    if (!confirmed) return;

    setDeletePending(true);
    setActionFeedback(null);
    try {
      const result = await onDeleteStory(currentEntry.key);
      if (!result.ok) {
        setActionFeedback({ type: "error", message: result.error });
        return;
      }
      setActionFeedback({ type: "success", message: `Deleted ${label}` });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setActionFeedback({ type: "error", message });
    } finally {
      setDeletePending(false);
    }
  }, [disabled, currentEntry, onDeleteStory, setActionFeedback]);

  const handleReset = useCallback(() => {
    applyDraftSelection(baseDraft);
    setActionFeedback(null);
  }, [applyDraftSelection, baseDraft, setActionFeedback]);

  const handleExport = useCallback(() => {
    const result = validateDraftForAction((validation) => `Cannot export: ${validation.error}`);
    if (!result) return;

    const raw = result.story;
    const blob = new Blob([yaml.stringify(raw)], { type: "text/yaml" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${slugify(raw.title || "story")}.yaml`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, [validateDraftForAction]);

  const handleFilePick = useCallback(() => {
    setActionFeedback(null);
    fileInputRef.current?.click();
  }, [setActionFeedback]);

  const handleFileChange: ChangeEventHandler<HTMLInputElement> = useCallback(async (event) => {
    const input = event.target;
    const file = input?.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = yaml.parse(text);
      const validation = validate(parsed);
      if (!validation.ok) {
        const error = validation.errors.join("; ");
        setValidationFeedback(
          { type: "error", message: error },
          [{ ok: false, name: "Schema validation", detail: error }],
        );
        return;
      }

      const nextDraft = normalizedToDraft(validation.story);
      const draftValidation = validateStudioDraft(nextDraft, validate);
      if (!draftValidation.ok) {
        applyDraftSelection(nextDraft);
        setValidationFeedback(
          { type: "error", message: `Cannot import: ${draftValidation.error}` },
          draftValidation.diagnostics,
        );
        return;
      }

      applyDraftSelection(nextDraft);
      clearValidationFeedback();

      const inferredName = getImportedStoryName(file.name, validation.story.title);
      setSavePending(true);
      const result = await onSaveStory(draftValidation.story, { name: inferredName });
      if (!result.ok) {
        setActionFeedback({ type: "error", message: result.error });
        return;
      }
      onSelectKey(result.key);
      setActionFeedback({ type: "success", message: `Imported and saved ${inferredName}` });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to import YAML file.";
      setActionFeedback({ type: "error", message });
    } finally {
      setSavePending(false);
      if (input) {
        input.value = "";
      }
    }
  }, [validate, applyDraftSelection, setValidationFeedback, clearValidationFeedback, onSaveStory, onSelectKey, setActionFeedback]);

  return {
    diagnostics,
    feedback,
    savePending,
    deletePending,
    setActionFeedback,
    fileInputRef,
    handleSave,
    handleSaveAs,
    handleDeleteStory,
    handleReset,
    handleExport,
    handleFilePick,
    handleFileChange,
  };
};
