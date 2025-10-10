import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import cytoscape, { Core, ElementDefinition, EventObject, LayoutOptions } from "cytoscape";
import type { Story, Transition } from "@utils/story-schema";
import type { NormalizedStory } from "@utils/story-validator";
import {
  LayoutName,
  StoryDraft,
  CheckpointDraft,
  normalizedToDraft,
  draftToStoryInput,
  buildMermaid,
  generateUniqueId,
  ensureOnActivate,
  cleanupOnActivate,
  splitLines,
  splitCsv,
  joinCsv,
  slugify,
} from "./checkpoint-studio.helpers";

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

const baseButtonClasses =
  "inline-flex items-center justify-center rounded border px-3 py-1 text-xs font-medium text-slate-200 transition focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-0 focus:ring-offset-transparent bg-slate-800 border-slate-700 hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50";

const primaryButtonClasses =
  "inline-flex items-center justify-center rounded border border-blue-700 bg-blue-600 px-3.5 py-1 text-xs font-semibold text-slate-50 shadow-sm transition hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-60";

const panelClasses = "rounded-lg border border-slate-800 bg-slate-950 shadow-sm";
const panelHeaderClasses = "flex items-center justify-between gap-2 border-b border-slate-800 px-3 py-2";
const panelBodyClasses = "flex flex-col gap-3 p-3";
const panelBodyTightClasses = "flex flex-col gap-2 p-3";
const panelBodyLooseClasses = "flex flex-col gap-4 p-3";
const controlClasses =
  "w-full rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600";
const textareaClasses = `${controlClasses} resize-y`;
const fieldClasses = "flex flex-col gap-1 text-xs text-slate-300";
const mutedTextClasses = "text-xs text-slate-400";
const graphClasses = "h-80 w-full rounded bg-slate-950";

const buildElements = (draft: StoryDraft, selected: string | null): ElementDefinition[] => {
  const nodes: ElementDefinition[] = draft.checkpoints.map((cp) => ({
    group: "nodes",
    data: {
      id: cp.id,
      label: cp.name || cp.id,
      type: draft.start === cp.id ? "start" : "checkpoint",
    },
    classes: selected === cp.id ? "selected" : undefined,
  }));
  const nodeIds = new Set(nodes.map((node) => node.data.id));
  const edges: ElementDefinition[] = draft.transitions
    .filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to))
    .map((edge) => ({
      group: "edges",
      data: {
        id: edge.id,
        source: edge.from,
        target: edge.to,
        label: edge.label || "",
        outcome: edge.outcome,
      },
    }));
  return [...nodes, ...edges];
};

const runLayout = (cy: Core, name: LayoutName, dagreReady: boolean) => {
  if (cy.elements().length === 0) return;
  const layoutName = name === "dagre" && !dagreReady ? "breadthfirst" : name;
  const options = { name: layoutName } as LayoutOptions;
  try {
    const layout = cy.layout(options);
    if (layout && typeof layout.run === "function") {
      layout.run();
    } else {
      cy.layout({ name: "grid" }).run();
    }
  } catch (err) {
    console.warn('[CheckpointStudio] layout failed, falling back to grid', err);
    try {
      cy.layout({ name: "grid" }).run();
    } catch (fallbackErr) {
      console.warn('[CheckpointStudio] fallback layout failed', fallbackErr);
    }
  }
  try {
    cy.fit(undefined, 32);
  } catch (fitErr) {
    console.warn('[CheckpointStudio] cy.fit failed', fitErr);
  }
};

const CheckpointStudio: React.FC<Props> = ({ sourceStory, validate, onApply, disabled }) => {
  const baseDraft = useMemo(() => normalizedToDraft(sourceStory), [sourceStory]);
  const [draft, setDraft] = useState<StoryDraft>(baseDraft);
  const [selectedId, setSelectedId] = useState<string | null>(baseDraft.start || baseDraft.checkpoints[0]?.id || null);
  const [layout, setLayout] = useState<LayoutName>("breadthfirst");
  const [dagreReady, setDagreReady] = useState(false);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [applyPending, setApplyPending] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);
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

  useEffect(() => {
    const containerEl = containerRef.current;
    if (!containerEl) return;

    let cy: Core | null = null;
    try {
      cy = cytoscape({
        container: containerEl,
        elements: [],
        boxSelectionEnabled: false,
        style: [
          {
            selector: "node",
            style: {
              "background-color": "#1f2937",
              "border-color": "#3b82f6",
              "border-width": "1px",
              color: "#f8fafc",
              label: "data(label)",
              "text-max-width": "140px",
              "text-wrap": "wrap",
              "font-size": "11px",
              "padding": "8px",
            },
          },
          {
            selector: "node[type = 'start']",
            style: { "background-color": "#2563eb" },
          },
          {
            selector: "node.selected",
            style: { "border-width": "3px", "border-color": "#facc15" },
          },
          {
            selector: "edge",
            style: {
              "curve-style": "bezier",
              "target-arrow-shape": "triangle",
              "line-color": "#94a3b8",
              "target-arrow-color": "#94a3b8",
              label: "data(label)",
              "font-size": "10px",
              "text-background-color": "#0f172a",
              "text-background-opacity": "0.6",
              "text-background-padding": "4px",
            },
          },
          {
            selector: "edge[outcome = 'win']",
            style: { "line-color": "#22c55e", "target-arrow-color": "#22c55e" },
          },
          {
            selector: "edge[outcome = 'fail']",
            style: {
              "line-color": "#ef4444",
              "target-arrow-color": "#ef4444",
              "line-style": "dashed",
            },
          },
        ] as any,
      });
    } catch (err) {
      console.error('[CheckpointStudio] failed to initialise cytoscape', err);
      return;
    }

    if (!cy) return;

    const handleTap = (event: EventObject) => {
      const id = event?.target?.id?.();
      if (id) setSelectedId(id);
    };

    cy.on("tap", "node", handleTap);
    cyRef.current = cy;

    return () => {
      try {
        cy.off("tap", "node", handleTap);
      } catch (err) {
        console.warn('[CheckpointStudio] failed to remove tap handler', err);
      }
      try {
        cy.destroy();
      } catch (err) {
        console.warn('[CheckpointStudio] failed to destroy cytoscape instance', err);
      }
      cyRef.current = null;
    };
  }, []);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const elements = buildElements(draft, selectedId);
    cy.elements().remove();
    cy.add(elements);
    runLayout(cy, layout, dagreReady);
  }, [draft, selectedId, layout, dagreReady]);

  useEffect(() => {
    let cancelled = false;
    import("cytoscape-dagre")
      .then((module) => {
        if (cancelled) return;
        const register = (module as unknown as { default?: (instance: typeof cytoscape) => void }).default;
        const fn: ((instance: typeof cytoscape) => void) | undefined = register || (module as unknown as (instance: typeof cytoscape) => void);
        if (typeof fn === "function") {
          fn(cytoscape);
          setDagreReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) setDagreReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={handleFileChange}
      />

      {feedback ? (
        <div
          className={`rounded border px-3 py-2 text-sm shadow-sm ${feedback.type === "success"
              ? "border-emerald-500 bg-emerald-500/10 text-emerald-200"
              : "border-rose-500 bg-rose-500/10 text-rose-200"
            }`}
        >
          {feedback.message}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button type="button" className={baseButtonClasses} onClick={handleAddCheckpoint} disabled={disabled}>
          + Checkpoint
        </button>
        <button
          type="button"
          className={baseButtonClasses}
          onClick={() => selectedId && handleAddTransition(selectedId)}
          disabled={disabled || !selectedId || draft.checkpoints.length === 0}
        >
          + Transition
        </button>
        <button
          type="button"
          className={baseButtonClasses}
          onClick={handleExport}
          disabled={draft.checkpoints.length === 0}
        >
          Export JSON
        </button>
        <button type="button" className={baseButtonClasses} onClick={handleFilePick}>
          Import JSON
        </button>
        <button type="button" className={baseButtonClasses} onClick={handleRunDiagnostics}>
          Run Diagnostics
        </button>
        <button type="button" className={baseButtonClasses} onClick={handleReset} disabled={!hasChanges}>
          Reset Draft
        </button>
        <button
          type="button"
          className={primaryButtonClasses}
          onClick={handleApply}
          disabled={applyPending || disabled}
        >
          {applyPending ? "Applying..." : "Apply to Runtime"}
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <div className={panelClasses}>
            <div className={panelHeaderClasses}>
              <div className="font-semibold">Checkpoint Graph</div>
              <div className="flex items-center gap-2">
                <select
                  value={layout}
                  onChange={(event) => setLayout(event.target.value as LayoutName)}
                  className={controlClasses}
                >
                  <option value="breadthfirst">Breadthfirst</option>
                  <option value="grid">Grid</option>
                  <option value="cose">COSE</option>
                  <option value="dagre" disabled={!dagreReady}>
                    Dagre {dagreReady ? "" : "(unavailable)"}
                  </option>
                </select>
                <button
                  type="button"
                  className={baseButtonClasses}
                  onClick={() => cyRef.current && runLayout(cyRef.current, layout, dagreReady)}
                >
                  Re-layout
                </button>
              </div>
            </div>
            <div ref={containerRef} className={graphClasses} />
          </div>

          <div className={panelClasses}>
            <div className={`${panelHeaderClasses} font-semibold`}>Story Details</div>
            <div className={panelBodyClasses}>
              <label className={fieldClasses}>
                <span>Title</span>
                <input
                  className={controlClasses}
                  value={draft.title}
                  onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
                />
              </label>
              <label className={fieldClasses}>
                <span>Global Lorebook</span>
                <input
                  className={controlClasses}
                  value={draft.global_lorebook}
                  onChange={(event) => setDraft((prev) => ({ ...prev, global_lorebook: event.target.value }))}
                />
              </label>
              <label className={fieldClasses}>
                <span>Start Checkpoint</span>
                <select
                  className={controlClasses}
                  value={draft.start}
                  onChange={(event) => setDraft((prev) => ({ ...prev, start: event.target.value }))}
                >
                  <option value="">Auto (first)</option>
                  {draft.checkpoints.map((cp) => (
                    <option key={cp.id} value={cp.id}>
                      {cp.name || cp.id}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className={panelClasses}>
            <div className={`${panelHeaderClasses} font-semibold`}>Diagnostics</div>
            <div className={panelBodyTightClasses}>
              {!diagnostics.length ? <div className={mutedTextClasses}>Run diagnostics to view results.</div> : null}
              {diagnostics.map((item, idx) => (
                <div key={`${item.name}-${idx}`} className={item.ok ? "text-emerald-300" : "text-rose-300"}>
                  <div className="font-medium">{item.name}</div>
                  <div className="text-xs opacity-80">{item.detail}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className={panelClasses}>
            <div className={`${panelHeaderClasses} font-semibold`}>Checkpoint Editor</div>
            <div className={panelBodyLooseClasses}>
              {!selectedCheckpoint ? (
                <div className={mutedTextClasses}>Select a checkpoint to edit.</div>
              ) : (
                <>
                  <label className={fieldClasses}>
                    <span>Checkpoint Id</span>
                    <input
                      className={controlClasses}
                      value={selectedCheckpoint.id}
                      onChange={(event) => handleCheckpointIdChange(selectedCheckpoint.id, event.target.value)}
                    />
                  </label>
                  <label className={fieldClasses}>
                    <span>Name</span>
                    <input
                      className={controlClasses}
                      value={selectedCheckpoint.name}
                      onChange={(event) => updateCheckpoint(selectedCheckpoint.id, (cp) => ({ ...cp, name: event.target.value }))}
                    />
                  </label>
                  <label className={fieldClasses}>
                    <span>Objective</span>
                    <textarea
                      className={textareaClasses}
                      rows={3}
                      value={selectedCheckpoint.objective}
                      onChange={(event) => updateCheckpoint(selectedCheckpoint.id, (cp) => ({ ...cp, objective: event.target.value }))}
                    />
                  </label>
                  <label className={fieldClasses}>
                    <span>Win Triggers (one per line)</span>
                    <textarea
                      className={textareaClasses}
                      rows={4}
                      value={selectedCheckpoint.triggers.win.join("\n")}
                      onChange={(event) => {
                        const values = splitLines(event.target.value);
                        updateCheckpoint(selectedCheckpoint.id, (cp) => ({
                          ...cp,
                          triggers: { ...cp.triggers, win: values.length ? values : ["/enter-regex-here/i"] },
                        }));
                      }}
                    />
                  </label>
                  <label className={fieldClasses}>
                    <span>Fail Triggers (optional)</span>
                    <textarea
                      className={textareaClasses}
                      rows={3}
                      value={(selectedCheckpoint.triggers.fail ?? []).join("\n")}
                      onChange={(event) => {
                        const values = splitLines(event.target.value);
                        updateCheckpoint(selectedCheckpoint.id, (cp) => ({
                          ...cp,
                          triggers: { ...cp.triggers, fail: values.length ? values : undefined },
                        }));
                      }}
                    />
                  </label>

                  <div className="space-y-2">
                    <div className="font-medium">On Activate</div>
                    <label className={fieldClasses}>
                      <span>DM Author Note</span>
                      <textarea
                        className={textareaClasses}
                        rows={3}
                        value={selectedCheckpoint.on_activate?.authors_note?.dm ?? ""}
                        onChange={(event) => {
                          const note = event.target.value;
                          updateCheckpoint(selectedCheckpoint.id, (cp) => {
                            const next = ensureOnActivate(cp.on_activate);
                            if (note.trim()) next.authors_note.dm = note;
                            else delete next.authors_note.dm;
                            return { ...cp, on_activate: cleanupOnActivate(next) };
                          });
                        }}
                      />
                    </label>
                    <label className={fieldClasses}>
                      <span>Companion Author Note</span>
                      <textarea
                        className={textareaClasses}
                        rows={3}
                        value={selectedCheckpoint.on_activate?.authors_note?.companion ?? ""}
                        onChange={(event) => {
                          const note = event.target.value;
                          updateCheckpoint(selectedCheckpoint.id, (cp) => {
                            const next = ensureOnActivate(cp.on_activate);
                            if (note.trim()) next.authors_note.companion = note;
                            else delete next.authors_note.companion;
                            return { ...cp, on_activate: cleanupOnActivate(next) };
                          });
                        }}
                      />
                    </label>
                    <label className={fieldClasses}>
                      <span>World Info Activate (comma separated)</span>
                      <input
                        className={controlClasses}
                        value={joinCsv(selectedCheckpoint.on_activate?.world_info?.activate)}
                        onChange={(event) => {
                          const entries = splitCsv(event.target.value);
                          updateCheckpoint(selectedCheckpoint.id, (cp) => {
                            const next = ensureOnActivate(cp.on_activate);
                            next.world_info.activate = entries;
                            return { ...cp, on_activate: cleanupOnActivate(next) };
                          });
                        }}
                      />
                    </label>
                    <label className={fieldClasses}>
                      <span>World Info Deactivate (comma separated)</span>
                      <input
                        className={controlClasses}
                        value={joinCsv(selectedCheckpoint.on_activate?.world_info?.deactivate)}
                        onChange={(event) => {
                          const entries = splitCsv(event.target.value);
                          updateCheckpoint(selectedCheckpoint.id, (cp) => {
                            const next = ensureOnActivate(cp.on_activate);
                            next.world_info.deactivate = entries;
                            return { ...cp, on_activate: cleanupOnActivate(next) };
                          });
                        }}
                      />
                    </label>
                    <label className={fieldClasses}>
                      <span>Preset Overrides (JSON)</span>
                      <textarea
                        className={`${textareaClasses} font-mono`}
                        rows={6}
                        value={JSON.stringify(selectedCheckpoint.on_activate?.preset_overrides ?? {}, null, 2)}
                        onChange={(event) => {
                          try {
                            const overrides = JSON.parse(event.target.value);
                            updateCheckpoint(selectedCheckpoint.id, (cp) => {
                              const next = ensureOnActivate(cp.on_activate);
                              next.preset_overrides = overrides;
                              return { ...cp, on_activate: cleanupOnActivate(next) };
                            });
                          } catch {
                            // ignore parse errors while typing
                          }
                        }}
                      />
                    </label>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="font-medium">Outgoing Transitions</div>
                      <button type="button" className={baseButtonClasses} onClick={() => handleAddTransition(selectedCheckpoint.id)}>
                        + Transition
                      </button>
                    </div>
                    {!outgoingTransitions.length ? (
                      <div className={mutedTextClasses}>No transitions from this checkpoint.</div>
                    ) : (
                      <div className="space-y-2">
                        {outgoingTransitions.map((edge) => (
                          <div key={edge.id} className="rounded border border-slate-600 p-2 space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                              <label className={fieldClasses}>
                                <span>To</span>
                                <select
                                  className={controlClasses}
                                  value={edge.to}
                                  onChange={(event) => updateTransition(edge.id, { to: event.target.value })}
                                >
                                  {draft.checkpoints.map((cp) => (
                                    <option key={cp.id} value={cp.id}>
                                      {cp.name || cp.id}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className={fieldClasses}>
                                <span>Outcome</span>
                                <select
                                  className={controlClasses}
                                  value={edge.outcome}
                                  onChange={(event) => updateTransition(edge.id, { outcome: event.target.value as "win" | "fail" })}
                                >
                                  <option value="win">win</option>
                                  <option value="fail">fail</option>
                                </select>
                              </label>
                            </div>
                            <label className={fieldClasses}>
                              <span>Label</span>
                              <input
                                className={controlClasses}
                                value={edge.label ?? ""}
                                onChange={(event) => updateTransition(edge.id, { label: event.target.value })}
                              />
                            </label>
                            <label className={fieldClasses}>
                              <span>Description</span>
                              <textarea
                                className={textareaClasses}
                                rows={2}
                                value={edge.description ?? ""}
                                onChange={(event) => updateTransition(edge.id, { description: event.target.value })}
                              />
                            </label>
                            <div className="flex justify-between items-center">
                              <div className="text-xs opacity-80">{edge.id}</div>
                              <button type="button" className={baseButtonClasses} onClick={() => handleRemoveTransition(edge.id)}>
                                Remove
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <button type="button" className={baseButtonClasses} onClick={() => handleRemoveCheckpoint(selectedCheckpoint.id)}>
                    Remove Checkpoint
                  </button>
                </>
              )}
            </div>
          </div>

          <div className={panelClasses}>
            <div className={`${panelHeaderClasses} font-semibold`}>Mermaid Export</div>
            <div className={panelBodyClasses}>
              <textarea className={`${textareaClasses} font-mono`} rows={10} readOnly value={mermaid} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CheckpointStudio;