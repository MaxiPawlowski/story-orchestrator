import React from "react";
import type { Transition } from "@utils/story-schema";
import { CheckpointDraft, StoryDraft, ensureOnActivate, cleanupOnActivate, splitLines, splitCsv, joinCsv } from "../checkpoint-studio.helpers";
import { getContext, eventSource, event_types } from "@services/SillyTavernAPI";
import { subscribeToEventSource } from "@utils/eventSource";
import MultiSelect from "./MultiSelect";

type Props = {
  draft: StoryDraft;
  selectedCheckpoint: CheckpointDraft | undefined;
  outgoingTransitions: StoryDraft["transitions"];
  onCheckpointIdChange: (id: string, value: string) => void;
  updateCheckpoint: (id: string, updater: (cp: CheckpointDraft) => CheckpointDraft) => void;
  onAddTransition: (fromId: string) => void;
  onRemoveTransition: (transitionId: string) => void;
  updateTransition: (transitionId: string, patch: Partial<StoryDraft["transitions"][number]>) => void;
  onRemoveCheckpoint: (id: string) => void;
};

const CheckpointEditorPanel: React.FC<Props> = ({
  draft,
  selectedCheckpoint,
  outgoingTransitions,
  onCheckpointIdChange,
  updateCheckpoint,
  onAddTransition,
  onRemoveTransition,
  updateTransition,
  onRemoveCheckpoint,
}) => {
  const [loreComments, setLoreComments] = React.useState<string[]>([]);

  const refreshLoreEntries = React.useCallback(async () => {
    const lorebook = (draft.global_lorebook || "").trim();
    if (!lorebook) { setLoreComments([]); return; }
    try {
      const { loadWorldInfo } = getContext();
      const res: any = await loadWorldInfo(lorebook);
      const entries = res?.entries ?? {};
      const comments = Object.values(entries)
        .map((e: any) => (typeof e?.comment === "string" ? e.comment.trim() : ""))
        .filter(Boolean);
      setLoreComments(comments);
    } catch (err) {
      console.warn("[CheckpointEditor] Failed to load world info entries", err);
      setLoreComments([]);
    }
  }, [draft.global_lorebook]);

  React.useEffect(() => {
    void refreshLoreEntries();
    const offs: Array<() => void> = [];
    const handler = () => void refreshLoreEntries();
    try {
      [
        event_types?.WORLDINFO_ENTRIES_LOADED,
        event_types?.WORLDINFO_UPDATED,
      ].forEach((eventName) => {
        if (!eventName) return;
        offs.push(subscribeToEventSource({ source: eventSource, eventName, handler }));
      });
    } catch (err) {
      console.warn("[CheckpointEditor] Failed to subscribe to WI events", err);
    }
    return () => { while (offs.length) { try { offs.pop()?.(); } catch {} } };
  }, [refreshLoreEntries]);

  const buildEntryOptions = React.useCallback((selected: string[] | undefined) => {
    const base = loreComments.slice();
    const extra = (selected ?? []).filter((s) => s && !base.includes(s));
    return [
      ...base.map((v) => ({ value: v, label: v })),
      ...extra.map((v) => ({ value: v, label: `${v} (not in lorebook)` })),
    ];
  }, [loreComments]);

  return (
    <div className="rounded-lg border border-slate-800 bg-[var(--SmartThemeBlurTintColor)] shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-slate-800 px-3 py-2 font-semibold">Checkpoint Editor</div>
      <div className="flex flex-col gap-4 p-3">
        {!selectedCheckpoint ? (
          <div className="text-xs text-slate-400">Select a checkpoint to edit.</div>
        ) : (
          <>
            <label className="flex flex-col gap-1 text-xs text-slate-300">
              <span>Checkpoint Id</span>
              <input
                className="w-full rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
                value={selectedCheckpoint.id}
                onChange={(e) => onCheckpointIdChange(selectedCheckpoint.id, e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-300">
              <span>Name</span>
              <input
                className="w-full rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
                value={selectedCheckpoint.name}
                onChange={(e) => updateCheckpoint(selectedCheckpoint.id, (cp) => ({ ...cp, name: e.target.value }))}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-300">
              <span>Objective</span>
              <textarea
                className="w-full resize-y rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
                rows={3}
                value={selectedCheckpoint.objective}
                onChange={(e) => updateCheckpoint(selectedCheckpoint.id, (cp) => ({ ...cp, objective: e.target.value }))}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-300">
              <span>Win Triggers (one per line)</span>
              <textarea
                className="w-full resize-y rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
                rows={4}
                value={selectedCheckpoint.triggers.win.join("\n")}
                onChange={(e) => {
                  const values = splitLines(e.target.value);
                  updateCheckpoint(selectedCheckpoint.id, (cp) => ({
                    ...cp,
                    triggers: { ...cp.triggers, win: values.length ? values : ["/enter-regex-here/i"] },
                  }));
                }}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-300">
              <span>Fail Triggers (optional)</span>
              <textarea
                className="w-full resize-y rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
                rows={3}
                value={(selectedCheckpoint.triggers.fail ?? []).join("\n")}
                onChange={(e) => {
                  const values = splitLines(e.target.value);
                  updateCheckpoint(selectedCheckpoint.id, (cp) => ({
                    ...cp,
                    triggers: { ...cp.triggers, fail: values.length ? values : undefined },
                  }));
                }}
              />
            </label>

            <div className="space-y-2">
              <div className="font-medium">On Activate</div>
              <label className="flex flex-col gap-1 text-xs text-slate-300">
                <span>DM Author Note</span>
                <textarea
                  className="w-full resize-y rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
                  rows={3}
                  value={selectedCheckpoint.on_activate?.authors_note?.dm ?? ""}
                  onChange={(e) => {
                    const note = e.target.value;
                    updateCheckpoint(selectedCheckpoint.id, (cp) => {
                      const next = ensureOnActivate(cp.on_activate);
                      if (note.trim()) next.authors_note.dm = note;
                      else delete next.authors_note.dm;
                      return { ...cp, on_activate: cleanupOnActivate(next) };
                    });
                  }}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-300">
                <span>Companion Author Note</span>
                <textarea
                  className="w-full resize-y rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
                  rows={3}
                  value={selectedCheckpoint.on_activate?.authors_note?.companion ?? ""}
                  onChange={(e) => {
                    const note = e.target.value;
                    updateCheckpoint(selectedCheckpoint.id, (cp) => {
                      const next = ensureOnActivate(cp.on_activate);
                      if (note.trim()) next.authors_note.companion = note;
                      else delete next.authors_note.companion;
                      return { ...cp, on_activate: cleanupOnActivate(next) };
                    });
                  }}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-300">
                <span>World Info Activate</span>
                <MultiSelect
                  options={buildEntryOptions(selectedCheckpoint.on_activate?.world_info?.activate)}
                  value={selectedCheckpoint.on_activate?.world_info?.activate ?? []}
                  onChange={(values) => {
                    updateCheckpoint(selectedCheckpoint.id, (cp) => {
                      const next = ensureOnActivate(cp.on_activate);
                      next.world_info.activate = values;
                      return { ...cp, on_activate: cleanupOnActivate(next) };
                    });
                  }}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-300">
                <span>World Info Deactivate</span>
                <MultiSelect
                  options={buildEntryOptions(selectedCheckpoint.on_activate?.world_info?.deactivate)}
                  value={selectedCheckpoint.on_activate?.world_info?.deactivate ?? []}
                  onChange={(values) => {
                    updateCheckpoint(selectedCheckpoint.id, (cp) => {
                      const next = ensureOnActivate(cp.on_activate);
                      next.world_info.deactivate = values;
                      return { ...cp, on_activate: cleanupOnActivate(next) };
                    });
                  }}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-300">
                <span>Preset Overrides (JSON)</span>
                <textarea
                  className="w-full resize-y rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600 font-mono"
                  rows={6}
                  value={JSON.stringify(selectedCheckpoint.on_activate?.preset_overrides ?? {}, null, 2)}
                  onChange={(e) => {
                    try {
                      const overrides = JSON.parse(e.target.value);
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
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded border bg-slate-800 border-slate-700 px-3 py-1 text-xs font-medium text-slate-200 transition hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-500"
                  onClick={() => onAddTransition(selectedCheckpoint.id)}
                >
                  + Transition
                </button>
              </div>
              {!outgoingTransitions.length ? (
                <div className="text-xs text-slate-400">No transitions from this checkpoint.</div>
              ) : (
                <div className="space-y-2">
                  {outgoingTransitions.map((edge) => (
                    <div key={edge.id} className="rounded border border-slate-600 p-2 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <label className="flex flex-col gap-1 text-xs text-slate-300">
                          <span>To</span>
                          <select
                            className="w-full rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
                            value={edge.to}
                            onChange={(e) => updateTransition(edge.id, { to: e.target.value })}
                          >
                            {draft.checkpoints.map((cp) => (
                              <option key={cp.id} value={cp.id}>
                                {cp.name || cp.id}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-slate-300">
                          <span>Outcome</span>
                          <select
                            className="w-full rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
                            value={edge.outcome}
                            onChange={(e) => updateTransition(edge.id, { outcome: e.target.value as Transition["outcome"] })}
                          >
                            <option value="win">win</option>
                            <option value="fail">fail</option>
                          </select>
                        </label>
                      </div>
                      <label className="flex flex-col gap-1 text-xs text-slate-300">
                        <span>Label</span>
                        <input
                          className="w-full rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
                          value={edge.label ?? ""}
                          onChange={(e) => updateTransition(edge.id, { label: e.target.value })}
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-xs text-slate-300">
                        <span>Description</span>
                        <textarea
                          className="w-full resize-y rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
                          rows={2}
                          value={edge.description ?? ""}
                          onChange={(e) => updateTransition(edge.id, { description: e.target.value })}
                        />
                      </label>
                      <div className="flex justify-between items-center">
                        <div className="text-xs opacity-80">{edge.id}</div>
                        <button
                          type="button"
                          className="inline-flex items-center justify-center rounded border bg-slate-800 border-slate-700 px-3 py-1 text-xs font-medium text-slate-200 transition hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-500"
                          onClick={() => onRemoveTransition(edge.id)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              className="inline-flex items-center justify-center rounded border bg-slate-800 border-slate-700 px-3 py-1 text-xs font-medium text-slate-200 transition hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-500"
              onClick={() => onRemoveCheckpoint(selectedCheckpoint.id)}
            >
              Remove Checkpoint
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default CheckpointEditorPanel;
