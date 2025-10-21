import React, { useCallback, useMemo, useRef, useState, useEffect } from "react";
import type { Story } from "@utils/story-schema";
import type { NormalizedStory } from "@utils/story-validator";
import { StoryDraft, CheckpointDraft, TransitionDraft, normalizedToDraft, draftToStoryInput, buildMermaid, generateUniqueId, slugify } from "@utils/checkpoint-studio";
import Toolbar from "@components/studio/Toolbar";
import FeedbackAlert from "@components/studio/FeedbackAlert";
import GraphPanel from "@components/studio/GraphPanel";
import StoryDetailsPanel from "@components/studio/StoryDetailsPanel";
import DiagnosticsPanel from "@components/studio/DiagnosticsPanel";
import CheckpointEditorPanel from "@components/studio/CheckpointEditorPanel";
import type { StoryLibraryEntry, SaveLibraryStoryResult, DeleteLibraryStoryResult } from "@components/context/StoryContext";

type ValidationResult = { ok: true; story: NormalizedStory } | { ok: false; errors: string[] };
type Diagnostic = { ok: boolean; name: string; detail: string };
type Feedback = { type: "success" | "error"; message: string };

type Props = {
  sourceStory: NormalizedStory | null | undefined;
  validate: (input: unknown) => ValidationResult;
  libraryEntries: StoryLibraryEntry[];
  selectedKey: string | null;
  selectedError: string | null;
  onSelectKey: (key: string) => void;
  onReloadLibrary: () => Promise<void>;
  onSaveStory: (story: Story, options?: { targetKey?: string; name?: string }) => Promise<SaveLibraryStoryResult>;
  onDeleteStory: (key: string) => Promise<DeleteLibraryStoryResult>;
  disabled?: boolean;
};

// Classes are inlined in JSX per request. Local helpers moved into subcomponents.

const CheckpointStudio: React.FC<Props> = ({
  sourceStory,
  validate,
  libraryEntries,
  selectedKey,
  selectedError,
  onSelectKey,
  onReloadLibrary,
  onSaveStory,
  onDeleteStory,
  disabled,
}) => {
  const baseDraft = useMemo(() => normalizedToDraft(sourceStory), [sourceStory]);
  const [draft, setDraft] = useState<StoryDraft>(baseDraft);
  const [selectedId, setSelectedId] = useState<string | null>(baseDraft.start || baseDraft.checkpoints[0]?.id || null);
  // layout and dagre lifecycle handled inside GraphPanel
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [savePending, setSavePending] = useState(false);
  const [deletePending, setDeletePending] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  // Graph lifecycle moved to GraphPanel

  const comparisonBase = useMemo(() => JSON.stringify(draftToStoryInput(baseDraft)), [baseDraft]);
  const comparisonDraft = useMemo(() => JSON.stringify(draftToStoryInput(draft)), [draft]);
  const hasChanges = comparisonBase !== comparisonDraft;

  const updateCheckpoint = (id: string, updater: (cp: CheckpointDraft) => CheckpointDraft) => {
    setDraft((prev) => {
      const index = prev.checkpoints.findIndex((cp) => cp.id === id);
      if (index < 0) return prev;
      const checkpoints = prev.checkpoints.map((cp, idx) => (idx === index ? updater(cp) : cp));
      return { ...prev, checkpoints };
    });
  };

  const handleCheckpointIdChange = (id: string, value: string) => {
    const nextId = value.trim();
    if (!nextId) {
      setFeedback({ type: "error", message: "Checkpoint id cannot be empty." });
      return;
    }
    if (draft.checkpoints.some((cp) => cp.id === nextId && cp.id !== id)) {
      setFeedback({ type: "error", message: `Checkpoint id '${nextId}' already exists.` });
      return;
    }
    setDraft((prev) => {
      const index = prev.checkpoints.findIndex((cp) => cp.id === id);
      if (index < 0) return prev;
      const checkpoints = prev.checkpoints.map((cp, idx) => (idx === index ? { ...cp, id: nextId } : cp));
      const transitions = prev.transitions.map((edge) => ({
        ...edge,
        from: edge.from === id ? nextId : edge.from,
        to: edge.to === id ? nextId : edge.to,
      }));
      const start = prev.start === id ? nextId : prev.start;
      return { ...prev, checkpoints, transitions, start };
    });
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
          on_activate: undefined,
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
      const checkpoints = prev.checkpoints.filter((cp) => cp.id !== id);
      const transitions = prev.transitions.filter((edge) => edge.from !== id && edge.to !== id);
      const start = prev.start === id ? checkpoints[0]?.id ?? "" : prev.start;
      nextSelection = start || checkpoints[0]?.id || null;
      return { ...prev, checkpoints, transitions, start };
    });
    setSelectedId((current) => (current === id ? nextSelection : current));
  };

  const handleAddTransition = (fromId: string) => {
    setDraft((prev) => {
      if (!prev.checkpoints.length) return prev;
      const fallbackTarget = prev.checkpoints.find((cp) => cp.id !== fromId)?.id || fromId;
      const existingIds = new Set(prev.transitions.map((edge) => edge.id));
      const id = generateUniqueId(existingIds, "edge");
      const transitions: TransitionDraft[] = [
        ...prev.transitions,
        {
          id,
          from: fromId,
          to: fallbackTarget,
          trigger: {
            type: "regex",
            patterns: ["/enter-pattern/i"],
            condition: "Replace with Arbiter condition",
          },
          label: "",
          description: "",
        },
      ];
      return { ...prev, transitions };
    });
  };

  const handleRemoveTransition = (transitionId: string) => {
    setDraft((prev) => ({
      ...prev,
      transitions: prev.transitions.filter((edge) => edge.id !== transitionId),
    }));
  };

  const updateTransition = (transitionId: string, patch: Partial<TransitionDraft>) => {
    setDraft((prev) => ({
      ...prev,
      transitions: prev.transitions.map((edge) => (edge.id === transitionId ? { ...edge, ...patch } : edge)),
    }));
  };

  const handleSave = useCallback(async () => {
    if (disabled) return;
    if (!currentEntry || currentEntry.kind !== "saved") {
      setFeedback({ type: "error", message: "Select a saved story before using Save. Try Save As to create a copy." });
      return;
    }
    const payload = draftToStoryInput(draft);
    const validation = validate(payload);
    if (!validation.ok) {
      setFeedback({ type: "error", message: validation.errors.join("; ") });
      return;
    }
    setSavePending(true);
    setFeedback(null);
    try {
      const result = await onSaveStory(payload, {
        targetKey: currentEntry.key,
        name: typeof currentEntry.meta?.name === "string" ? currentEntry.meta.name : undefined,
      });
      if (!result.ok) {
        setFeedback({ type: "error", message: result.error });
        return;
      }
      onSelectKey(result.key);
      const label = typeof currentEntry.meta?.name === "string" ? currentEntry.meta.name : "story";
      setFeedback({ type: "success", message: `Saved ${label}` });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setFeedback({ type: "error", message });
    } finally {
      setSavePending(false);
    }
  }, [disabled, currentEntry, draft, validate, onSaveStory, onSelectKey]);

  const handleSaveAs = useCallback(async () => {
    if (disabled) return;
    const payload = draftToStoryInput(draft);
    const validation = validate(payload);
    if (!validation.ok) {
      setFeedback({ type: "error", message: validation.errors.join("; ") });
      return;
    }
    const defaultName = suggestedName;
    const input = typeof window !== "undefined"
      ? window.prompt("Enter a name for the saved story", defaultName)
      : null;
    if (input === null) return;
    const candidate = input.trim();
    if (!candidate) return;
    setSavePending(true);
    setFeedback(null);
    try {
      const result = await onSaveStory(payload, { name: candidate });
      if (!result.ok) {
        setFeedback({ type: "error", message: result.error });
        return;
      }
      onSelectKey(result.key);
      setFeedback({ type: "success", message: `Saved ${candidate}` });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setFeedback({ type: "error", message });
    } finally {
      setSavePending(false);
    }
  }, [disabled, draft, validate, onSaveStory, suggestedName, onSelectKey]);

  const handleReloadLibrary = useCallback(async () => {
    try {
      await onReloadLibrary();
      setFeedback({ type: "success", message: "Reloaded story library." });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setFeedback({ type: "error", message });
    }
  }, [onReloadLibrary]);

  const handleDeleteStory = useCallback(async () => {
    if (disabled) return;
    const target = currentEntry;
    if (!target) {
      setFeedback({ type: "error", message: "Select a saved story to delete." });
      return;
    }
    if (target.kind !== "saved") {
      setFeedback({ type: "error", message: "Only saved stories can be deleted." });
      return;
    }
    const label = typeof target.meta?.name === "string" && target.meta.name.trim().length
      ? target.meta.name.trim()
      : "saved story";
    const confirmed = typeof window === "undefined"
      ? true
      : window.confirm(`Delete ${label}? This action cannot be undone.`);
    if (!confirmed) return;

    setDeletePending(true);
    setFeedback(null);
    try {
      const result = await onDeleteStory(target.key);
      if (!result.ok) {
        setFeedback({ type: "error", message: result.error });
        return;
      }
      setFeedback({ type: "success", message: `Deleted ${label}` });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setFeedback({ type: "error", message });
    } finally {
      setDeletePending(false);
    }
  }, [disabled, currentEntry, onDeleteStory]);

  const handleRunDiagnostics = () => {
    const raw = draftToStoryInput(draft);
    const results: Diagnostic[] = [];
    const validation = validate(raw);
    if (validation.ok) {
      results.push({
        ok: true,
        name: "Schema validation",
        detail: `Loaded ${validation.story.checkpoints.length} checkpoints and ${validation.story.transitions.length} transitions.`,
      });
      const triggerTotals = validation.story.transitions.reduce((acc, edge) => {
        acc.total += 1;
        if (edge.trigger.type === "timed") acc.timed += 1;
        return acc;
      }, { total: 0, timed: 0 });
      results.push({
        ok: true,
        name: "Trigger compilation",
        detail: `Compiled ${triggerTotals.total} triggers (${triggerTotals.timed} timed).`,
      });
    } else {
      results.push({ ok: false, name: "Schema validation", detail: validation.errors.join("; ") });
    }
    const nodeIds = new Set(raw.checkpoints.map((cp) => cp.id));
    const missing = raw.transitions.filter((edge) => !nodeIds.has(edge.from) || !nodeIds.has(edge.to));
    if (missing.length) {
      results.push({
        ok: false,
        name: "Transition targets",
        detail: `Transitions with missing endpoints: ${missing.map((edge) => edge.id).join(", ")}.`,
      });
    } else {
      results.push({ ok: true, name: "Transition targets", detail: "All transitions map to existing checkpoints." });
    }
    setDiagnostics(results);
  };

  const handleReset = () => {
    setDraft(baseDraft);
    setSelectedId(baseDraft.start || baseDraft.checkpoints[0]?.id || null);
    setFeedback(null);
  };

  const handleExport = () => {
    const raw = draftToStoryInput(draft);
    const blob = new Blob([JSON.stringify(raw, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slugify(raw.title || "story")}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleFilePick = () => {
    setFeedback(null);
    fileInputRef.current?.click();
  };

  const handleFileChange: React.ChangeEventHandler<HTMLInputElement> = async (event) => {
    const input = event.target;
    const file = input?.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const validation = validate(parsed);
      if (!validation.ok) {
        setFeedback({ type: "error", message: validation.errors.join("; ") });
        return;
      }

      const nextDraft = normalizedToDraft(validation.story);
      setDraft(nextDraft);
      setSelectedId(nextDraft.start || nextDraft.checkpoints[0]?.id || null);
      setFeedback(null);

      const sanitized = draftToStoryInput(nextDraft);
      const baseFileName = file.name.replace(/\.[^/.]+$/, "");
      const inferredName = validation.story.title?.trim()
        || baseFileName
        || "Imported Story";

      setSavePending(true);
      const result = await onSaveStory(sanitized, { name: inferredName });
      if (!result.ok) {
        setFeedback({ type: "error", message: result.error });
        return;
      }
      onSelectKey(result.key);
      setFeedback({ type: "success", message: `Imported and saved ${inferredName}` });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to import JSON file.";
      setFeedback({ type: "error", message });
    } finally {
      setSavePending(false);
      if (input) {
        // Reset file input for consecutive imports.
        input.value = "";
      }
    }
  };

  const mermaid = useMemo(() => buildMermaid(draft), [draft]);
  const selectedCheckpoint = selectedId ? draft.checkpoints.find((cp) => cp.id === selectedId) : undefined;
  const outgoingTransitions = selectedId ? draft.transitions.filter((edge) => edge.from === selectedId) : [];

  return (
    <div className="flex flex-col gap-4 text-sm text-slate-100">
      <input ref={fileInputRef} type="file" accept="application/json" className="hidden" onChange={handleFileChange} />

      <div className="flex flex-col gap-2 rounded-lg border border-slate-800 bg-[var(--SmartThemeBlurTintColor)] p-3">
        <label className="flex flex-col gap-1 text-xs text-slate-300">
          <span>Story Entry</span>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="min-w-[200px] rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
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
              className="inline-flex items-center justify-center rounded border bg-slate-800 border-slate-700 px-3 py-1 text-xs font-medium text-slate-200 transition hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={handleReloadLibrary}
              disabled={!!disabled || savePending || deletePending}
            >
              Refresh
            </button>
            <button
              type="button"
              className="inline-flex items-center justify-center rounded border border-red-800 bg-red-700/80 px-3 py-1 text-xs font-medium text-red-50 shadow-sm transition hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={handleDeleteStory}
              disabled={!!disabled || !canDelete || savePending || deletePending}
              title={canDelete ? "Delete this saved story" : "Only saved stories can be deleted"}
            >
              {deletePending ? "Deleting…" : "Delete"}
            </button>
          </div>
        </label>
        {selectedError && (
          <div className="rounded border border-red-700/60 bg-red-900/30 px-3 py-2 text-xs text-red-200">
            Validation failed: {selectedError}
          </div>
        )}
      </div>

      <FeedbackAlert feedback={feedback} />

      <Toolbar
        disabled={disabled}
        hasChanges={hasChanges}
        savePending={savePending}
        saveDisabled={!canSave || !!disabled || savePending}
        saveAsDisabled={!!disabled || savePending}
        canAddTransition={!!selectedId && draft.checkpoints.length > 0}
        onAddCheckpoint={handleAddCheckpoint}
        onAddTransition={() => selectedId && handleAddTransition(selectedId)}
        onExport={handleExport}
        onImportPick={handleFilePick}
        onRunDiagnostics={handleRunDiagnostics}
        onReset={handleReset}
        onSave={handleSave}
        onSaveAs={handleSaveAs}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <GraphPanel draft={draft} selectedId={selectedId} onSelect={(id) => setSelectedId(id)} />
          <StoryDetailsPanel draft={draft} setDraft={setDraft} />
          <DiagnosticsPanel diagnostics={diagnostics} />
        </div>

        <div className="flex flex-col gap-4">
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
      </div>
    </div>
  );
};

export default CheckpointStudio;
