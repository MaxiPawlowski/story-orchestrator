import React, { useCallback, useMemo, useRef, useState, useEffect } from "react";
import type { Story, Transition } from "@utils/story-schema";
import type { NormalizedStory } from "@utils/story-validator";
import { StoryDraft, CheckpointDraft, normalizedToDraft, draftToStoryInput, buildMermaid, generateUniqueId, slugify } from "@utils/checkpoint-studio";
import Toolbar from "@components/studio/Toolbar";
import FeedbackAlert from "@components/studio/FeedbackAlert";
import GraphPanel from "@components/studio/GraphPanel";
import StoryDetailsPanel from "@components/studio/StoryDetailsPanel";
import DiagnosticsPanel from "@components/studio/DiagnosticsPanel";
import CheckpointEditorPanel from "@components/studio/CheckpointEditorPanel";

type ValidationResult = { ok: true; story: NormalizedStory } | { ok: false; errors: string[] };
type ApplyResult = { ok: true; story: NormalizedStory } | { ok: false; errors: string[] };
type Diagnostic = { ok: boolean; name: string; detail: string };
type Feedback = { type: "success" | "error"; message: string };

type Props = {
  sourceStory: NormalizedStory | null | undefined;
  validate: (input: unknown) => ValidationResult;
  onApply: (story: Story) => Promise<ApplyResult> | ApplyResult;
  disabled?: boolean;
};

// Classes are inlined in JSX per request. Local helpers moved into subcomponents.

const CheckpointStudio: React.FC<Props> = ({ sourceStory, validate, onApply, disabled }) => {
  const baseDraft = useMemo(() => normalizedToDraft(sourceStory), [sourceStory]);
  const [draft, setDraft] = useState<StoryDraft>(baseDraft);
  const [selectedId, setSelectedId] = useState<string | null>(baseDraft.start || baseDraft.checkpoints[0]?.id || null);
  // layout and dagre lifecycle handled inside GraphPanel
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [applyPending, setApplyPending] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setDraft(baseDraft);
    setSelectedId(baseDraft.start || baseDraft.checkpoints[0]?.id || null);
  }, [baseDraft]);

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
          triggers: { win: ["/enter-regex-here/i"] },
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
      const transitions = [
        ...prev.transitions,
        { id, from: fromId, to: fallbackTarget, outcome: "win" as Transition["outcome"], label: "", description: "" },
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

  const updateTransition = (transitionId: string, patch: Partial<ReturnType<typeof draftToStoryInput>["transitions"][number]>) => {
    setDraft((prev) => ({
      ...prev,
      transitions: prev.transitions.map((edge) => (edge.id === transitionId ? { ...edge, ...patch } : edge)),
    }));
  };

  const handleApply = useCallback(async () => {
    setApplyPending(true);
    setFeedback(null);
    try {
      const payload = draftToStoryInput(draft);
      const result = await onApply(payload);
      if (result.ok) {
        setFeedback({ type: "success", message: `Story applied: ${result.story.title}` });
      } else {
        setFeedback({ type: "error", message: result.errors.join("; ") });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setFeedback({ type: "error", message });
    } finally {
      setApplyPending(false);
    }
  }, [draft, onApply]);

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
      const totalWin = validation.story.checkpoints.reduce((sum, cp) => sum + cp.winTriggers.length, 0);
      const totalFail = validation.story.checkpoints.reduce((sum, cp) => sum + (cp.failTriggers?.length ?? 0), 0);
      results.push({
        ok: true,
        name: "Regex compilation",
        detail: `Compiled ${totalWin} win triggers and ${totalFail} fail triggers.`,
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

  const handleFileChange: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    file
      .text()
      .then((text) => {
        try {
          const parsed = JSON.parse(text);
          const validation = validate(parsed);
          if (!validation.ok) {
            setFeedback({ type: "error", message: validation.errors.join("; ") });
            return;
          }
          const nextDraft = normalizedToDraft(validation.story);
          setDraft(nextDraft);
          setSelectedId(nextDraft.start || nextDraft.checkpoints[0]?.id || null);
          setFeedback({ type: "success", message: `Imported ${file.name}` });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Failed to parse JSON file.";
          setFeedback({ type: "error", message });
        }
      })
      .finally(() => {
        if (event.target) event.target.value = "";
      });
  };

  const mermaid = useMemo(() => buildMermaid(draft), [draft]);
  const selectedCheckpoint = selectedId ? draft.checkpoints.find((cp) => cp.id === selectedId) : undefined;
  const outgoingTransitions = selectedId ? draft.transitions.filter((edge) => edge.from === selectedId) : [];

  return (
    <div className="flex flex-col gap-4 text-sm text-slate-100">
      <input ref={fileInputRef} type="file" accept="application/json" className="hidden" onChange={handleFileChange} />

      <FeedbackAlert feedback={feedback} />

      <Toolbar
        disabled={disabled}
        hasChanges={hasChanges}
        applyPending={applyPending}
        canAddTransition={!!selectedId && draft.checkpoints.length > 0}
        onAddCheckpoint={handleAddCheckpoint}
        onAddTransition={() => selectedId && handleAddTransition(selectedId)}
        onExport={handleExport}
        onImportPick={handleFilePick}
        onRunDiagnostics={handleRunDiagnostics}
        onReset={handleReset}
        onApply={handleApply}
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
            updateTransition={updateTransition as unknown as any}
            onRemoveCheckpoint={handleRemoveCheckpoint}
          />
        </div>
      </div>
    </div>
  );
};

export default CheckpointStudio;
