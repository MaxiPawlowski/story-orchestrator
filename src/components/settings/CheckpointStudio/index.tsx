import React, { useMemo, useState, useEffect } from "react";
import type { Story } from "@utils/story-schema";
import type { NormalizedStory } from "@utils/story-validator";
import {
  StoryDraft,
  CheckpointDraft,
  TransitionDraft,
  normalizedToDraft,
  safeDraftToStoryInput,
  generateUniqueId,
  updateCheckpointDraft,
  renameCheckpointDraftId,
  removeCheckpointDraft,
  appendTransitionDraft,
  removeTransitionDraft,
  patchTransitionDraft,
} from "@utils/checkpoint-studio";
import Toolbar from "@components/studio/Toolbar";
import FeedbackAlert from "@components/studio/FeedbackAlert";
import GraphPanel from "@components/studio/GraphPanel";
import StoryDetailsPanel from "@components/studio/StoryDetailsPanel";
import DiagnosticsPanel from "@components/studio/DiagnosticsPanel";
import CheckpointEditorPanel from "@components/studio/CheckpointEditorPanel";
import type { StoryLibraryEntry, SaveLibraryStoryResult, DeleteLibraryStoryResult } from "@components/context/StoryContext";
import { useStudioActions } from "./useStudioActions";

type ValidationResult = { ok: true; story: NormalizedStory } | { ok: false; errors: string[] };

type Props = {
  sourceStory: NormalizedStory | null | undefined;
  validate: (input: unknown) => ValidationResult;
  libraryEntries: StoryLibraryEntry[];
  selectedKey: string | null;
  selectedError: string | null;
  onSelectKey: (key: string) => void;
  onSaveStory: (story: Story, options?: { targetKey?: string; name?: string }) => Promise<SaveLibraryStoryResult>;
  onDeleteStory: (key: string) => Promise<DeleteLibraryStoryResult>;
  disabled?: boolean;
};

const CheckpointStudio: React.FC<Props> = ({
  sourceStory,
  validate,
  libraryEntries,
  selectedKey,
  selectedError,
  onSelectKey,
  onSaveStory,
  onDeleteStory,
  disabled,
}) => {
  const baseDraft = useMemo(() => normalizedToDraft(sourceStory), [sourceStory]);
  const [draft, setDraft] = useState<StoryDraft>(baseDraft);
  const [selectedId, setSelectedId] = useState<string | null>(baseDraft.start || baseDraft.checkpoints[0]?.id || null);

  useEffect(() => {
    setDraft(baseDraft);
    setSelectedId(baseDraft.start || baseDraft.checkpoints[0]?.id || null);
  }, [baseDraft]);

  const currentEntry = useMemo(() => {
    return libraryEntries.find((entry) => entry.key === selectedKey) ?? null;
  }, [libraryEntries, selectedKey]);

  const suggestedName = useMemo(() => {
    if (currentEntry?.kind === "saved" && typeof currentEntry.meta?.name === "string") {
      return currentEntry.meta.name;
    }
    const draftTitle = typeof draft.title === "string" ? draft.title.trim() : "";
    if (draftTitle) return draftTitle;

    const existingNames = new Set<string>();
    libraryEntries.forEach((entry) => {
      if (entry.kind === "saved" && typeof entry.meta?.name === "string") {
        existingNames.add(entry.meta.name.toLowerCase());
      }
    });

    const base = "Story";
    let counter = existingNames.size + 1;
    let candidate = `${base} ${counter}`;
    while (existingNames.has(candidate.toLowerCase())) {
      counter += 1;
      candidate = `${base} ${counter}`;
    }
    return candidate;
  }, [currentEntry, draft.title, libraryEntries]);

  const canSave = currentEntry?.kind === "saved" && currentEntry.ok;
  const canDelete = currentEntry?.kind === "saved";

  useEffect(() => {
    if (!selectedId && draft.checkpoints.length) {
      setSelectedId(draft.start || draft.checkpoints[0].id);
      return;
    }
    if (selectedId && !draft.checkpoints.some((cp) => cp.id === selectedId)) {
      setSelectedId(draft.start || draft.checkpoints[0]?.id || null);
    }
  }, [draft, selectedId]);

  const comparisonBase = useMemo(() => {
    const result = safeDraftToStoryInput(baseDraft);
    return result.ok ? JSON.stringify(result.story) : "";
  }, [baseDraft]);

  const comparisonDraft = useMemo(() => {
    const result = safeDraftToStoryInput(draft);
    return result.ok ? JSON.stringify(result.story) : "";
  }, [draft]);

  const hasChanges = comparisonBase !== comparisonDraft;

  const feedbackActions = useStudioActions({
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
  });

  const {
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
  } = feedbackActions;

  const updateCheckpoint = (id: string, updater: (cp: CheckpointDraft) => CheckpointDraft) => {
    setDraft((prev) => updateCheckpointDraft(prev, id, updater));
  };

  const handleCheckpointIdChange = (id: string, value: string) => {
    const nextId = value.trim();
    if (!nextId) {
      setActionFeedback({ type: "error", message: "Checkpoint id cannot be empty." });
      return;
    }
    if (draft.checkpoints.some((cp) => cp.id === nextId && cp.id !== id)) {
      setActionFeedback({ type: "error", message: `Checkpoint id '${nextId}' already exists.` });
      return;
    }
    setDraft((prev) => renameCheckpointDraftId(prev, id, nextId));
    setSelectedId(nextId);
  };

  const handleAddCheckpoint = () => {
    let createdId = "";
    setDraft((prev) => {
      const existingIds = new Set(prev.checkpoints.map((cp) => cp.id));
      const id = generateUniqueId(existingIds, "cp");
      createdId = id;
      const checkpoints = [
        ...prev.checkpoints,
        {
          id,
          name: `Checkpoint ${prev.checkpoints.length + 1}`,
          objective: "",
        },
      ];
      const start = prev.start || id;
      return { ...prev, checkpoints, start };
    });
    setSelectedId(createdId);
  };

  const handleRemoveCheckpoint = (id: string) => {
    let nextSelection: string | null = null;
    setDraft((prev) => {
      const result = removeCheckpointDraft(prev, id);
      nextSelection = result.nextSelection;
      return result.draft;
    });
    setSelectedId((current) => (current === id ? nextSelection : current));
  };

  const handleAddTransition = (fromId: string) => {
    setDraft((prev) => {
      if (!prev.checkpoints.length) return prev;
      const fallbackTarget = prev.checkpoints.find((cp) => cp.id !== fromId)?.id || fromId;
      const existingIds = new Set(
        prev.checkpoints.flatMap((cp) => (cp.transitions ?? []).map((t) => t.id).filter(Boolean) as string[])
      );
      const id = generateUniqueId(existingIds, "edge");
      const stableId = `stable-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const newTransition: TransitionDraft = {
        id,
        to: fallbackTarget,
        trigger: {
          type: "regex",
          patterns: ["/enter-pattern/i"],
          condition: "Replace with Arbiter condition",
        },
        label: "",
        description: "",
        _stableId: stableId,
      };
      return appendTransitionDraft(prev, fromId, newTransition);
    });
  };

  const handleRemoveTransition = (transitionId: string) => {
    setDraft((prev) => removeTransitionDraft(prev, transitionId));
  };

  const updateTransition = (transitionId: string, patch: Partial<TransitionDraft>) => {
    setDraft((prev) => patchTransitionDraft(prev, transitionId, patch));
  };

  const selectedCheckpoint = selectedId ? draft.checkpoints.find((cp) => cp.id === selectedId) : undefined;
  const outgoingTransitions = selectedCheckpoint?.transitions ?? [];

  return (
    <div className="flex flex-col gap-4 text-sm st-strong">
      <input ref={fileInputRef} type="file" accept=".yaml,.yml,text/yaml" className="hidden" onChange={handleFileChange} />

      <div className="flex flex-col gap-2 st-bg-tint pr-[30px]">
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="text_pole st-input min-w-[200px] px-3 py-1 text-xs mb-0 flex-1"
            value={selectedKey ?? ""}
            disabled={!!disabled || savePending || deletePending || !libraryEntries.length}
            onChange={(event) => {
              const next = event.target.value;
              if (next) {
                onSelectKey(next);
              }
            }}
          >
            {!libraryEntries.length && <option value="">No stories available</option>}
            {libraryEntries.map((entry) => (
              <option key={entry.key} value={entry.key}>
                {entry.ok ? entry.label : `${entry.label} (invalid)`}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="st-button danger"
            onClick={handleDeleteStory}
            disabled={!!disabled || !canDelete || savePending || deletePending}
            title={canDelete ? "Delete this saved story" : "Only saved stories can be deleted"}
          >
            {deletePending ? "Deleting…" : "Delete"}
          </button>
          <Toolbar
            hasChanges={hasChanges}
            savePending={savePending}
            saveDisabled={!canSave || !!disabled || savePending}
            saveAsDisabled={!!disabled || savePending}
            canAddTransition={!!selectedId && draft.checkpoints.length > 0}

            onExport={handleExport}
            onImportPick={handleFilePick}
            onReset={handleReset}
            onSave={handleSave}
            onSaveAs={handleSaveAs}
          />
        </div>
        {selectedError && (
          <div className="st-alert-error rounded px-3 py-2 text-xs">
            Validation failed: {selectedError}
          </div>
        )}
      </div>

      <FeedbackAlert feedback={feedback} />


      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex h-full flex-col gap-4">
          <GraphPanel
            canAddTransition={!!selectedId && draft.checkpoints.length > 0}
            disabled={disabled}
            onAddCheckpoint={handleAddCheckpoint}
            onAddTransition={() => selectedId && handleAddTransition(selectedId)}
            draft={draft}
            selectedId={selectedId}
            onSelect={(id) => setSelectedId(id)}
          />

        </div>

        <div className="flex flex-col gap-4">
          <StoryDetailsPanel draft={draft} setDraft={setDraft} />
          <DiagnosticsPanel diagnostics={diagnostics} />
        </div>
      </div>
      <CheckpointEditorPanel
        draft={draft}
        selectedCheckpoint={selectedCheckpoint}
        outgoingTransitions={outgoingTransitions}
        onCheckpointIdChange={handleCheckpointIdChange}
        updateCheckpoint={updateCheckpoint}
        onAddTransition={handleAddTransition}
        onRemoveTransition={handleRemoveTransition}
        updateTransition={updateTransition}
        onRemoveCheckpoint={handleRemoveCheckpoint}
      />
    </div>
  );
};

export default CheckpointStudio;
