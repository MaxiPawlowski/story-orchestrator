import React from "react";
import {
  type StoryDraft,
  type CheckpointDraft,
  type TransitionDraft,
  type TransitionTriggerDraft,
  splitLines,
} from "@utils/checkpoint-studio";

type Props = {
  draft: StoryDraft;
  checkpoint: CheckpointDraft;
  outgoingTransitions: TransitionDraft[];
  onAddTransition: (fromId: string) => void;
  onRemoveTransition: (transitionId: string) => void;
  updateTransition: (transitionId: string, patch: Partial<TransitionDraft>) => void;
};

const TransitionsTab: React.FC<Props> = ({
  draft,
  checkpoint,
  outgoingTransitions,
  onAddTransition,
  onRemoveTransition,
  updateTransition,
}) => (
  <div className="space-y-2">
    <div className="flex items-center justify-between">
      <div className="font-medium">Outgoing Transitions</div>
      <button
        type="button"
        className="inline-flex items-center justify-center rounded border bg-slate-800 border-slate-700 px-3 py-1 text-xs font-medium text-slate-200 transition hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-500"
        onClick={() => onAddTransition(checkpoint.id)}
      >
        + Transition
      </button>
    </div>
    {!outgoingTransitions.length ? (
      <div className="text-xs text-slate-400">No transitions from this checkpoint.</div>
    ) : (
      <div className="space-y-2">
        {outgoingTransitions.map((edge) => {
          const trigger = edge.trigger;
          const setTrigger = (next: TransitionTriggerDraft) => {
            updateTransition(edge.id, { trigger: next });
          };
          const patchTrigger = (patch: Partial<TransitionTriggerDraft>) => {
            setTrigger({ ...trigger, ...patch });
          };
          const handleTypeChange = (nextType: TransitionTriggerDraft["type"]) => {
            if (nextType === trigger.type) return;
            if (nextType === "timed") {
              setTrigger({
                type: "timed",
                within_turns: Math.max(1, trigger.within_turns ?? 3),
                label: trigger.label,
                patterns: [],
              });
            } else {
              setTrigger({
                type: "regex",
                patterns: trigger.patterns?.length ? trigger.patterns : ["/enter-pattern/i"],
                condition: trigger.condition ?? "Replace with Arbiter condition",
                label: trigger.label,
              });
            }
          };
          const isRegex = trigger.type === "regex";

          return (
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
                  <span>Type</span>
                  <select
                    className="w-full rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
                    value={trigger.type}
                    onChange={(e) => handleTypeChange(e.target.value as TransitionTriggerDraft["type"])}
                  >
                    <option value="regex">Arbiter Regex</option>
                    <option value="timed">Timed Turns</option>
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs text-slate-300">
                  <span>Label</span>
                  <input
                    className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
                    value={trigger.label ?? ""}
                    onChange={(e) => patchTrigger({ label: e.target.value })}
                  />
                </label>
                {isRegex ? (
                  <div />
                ) : (
                  <label className="flex flex-col gap-1 text-xs text-slate-300">
                    <span>Advance After Turns</span>
                    <input
                      type="number"
                      min={1}
                      className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
                      value={Math.max(1, trigger.within_turns ?? 1)}
                      onChange={(e) => patchTrigger({ within_turns: Math.max(1, Number(e.target.value) || 1) })}
                    />
                  </label>
                )}
              </div>
              {isRegex ? (
                <div className="grid gap-2">
                  <label className="flex flex-col gap-1 text-xs text-slate-300">
                    <span>Patterns (one per line)</span>
                    <textarea
                      className="w-full resize-y rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
                      rows={3}
                      value={(trigger.patterns ?? []).join("\n")}
                      onChange={(e) => patchTrigger({ patterns: splitLines(e.target.value) })}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-slate-300">
                    <span>Arbiter Condition (LLM only)</span>
                    <textarea
                      className="w-full resize-y rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
                      rows={2}
                      value={trigger.condition ?? ""}
                      onChange={(e) => patchTrigger({ condition: e.target.value })}
                    />
                  </label>
                </div>
              ) : (
                <div className="text-xs text-slate-400">
                  This transition will advance automatically once the turn counter reaches the specified value.
                </div>
              )}
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
          );
        })}
      </div>
    )}
  </div>
);

export default TransitionsTab;

