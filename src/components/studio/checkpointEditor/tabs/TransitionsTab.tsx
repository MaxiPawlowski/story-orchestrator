import React from "react";
import {
  type StoryDraft,
  type CheckpointDraft,
  type TransitionDraft,
  type TransitionTriggerDraft,
  splitLines,
} from "@utils/checkpoint-studio";
import HelpTooltip from "../../HelpTooltip";

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
      <div className="flex items-center gap-1 font-medium text-slate-200">
        Outgoing Transitions
        <HelpTooltip title="Define how this checkpoint hands off to the next one through timers or Arbiter matches." />
      </div>
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
                patterns: [],
              });
            } else {
              setTrigger({
                type: "regex",
                patterns: trigger.patterns?.length ? trigger.patterns : ["/enter-pattern/i"],
                condition: trigger.condition ?? "Replace with Arbiter condition",
              });
            }
          };
          const isRegex = trigger.type === "regex";

          return (
            <div key={edge._stableId} className="rounded border border-slate-600 p-2 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1 text-xs text-slate-300">
                  <span className="inline-flex items-center gap-1">
                    To
                    <HelpTooltip title="Select the destination checkpoint the story should advance to." />
                  </span>
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
                  <span className="inline-flex items-center gap-1">
                    Type
                    <HelpTooltip title="Use 'Arbiter Regex' for text triggers or 'Timed Turns' for automatic scheduling." />
                  </span>
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
                  <span className="inline-flex items-center gap-1">
                    Transition ID
                    <HelpTooltip title="Unique key for diagnostics and referencing this edge elsewhere. Useful for the arbiter to make it meaningful." />
                  </span>
                  <input
                    className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
                    value={edge.id}
                    onChange={(e) => updateTransition(edge.id, { id: e.target.value })}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-300">
                  <span className="inline-flex items-center gap-1">
                    Label
                    <HelpTooltip title="Helper text describing why this transition fires." />
                  </span>
                  <input
                    className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
                    value={edge.label ?? ""}
                    onChange={(e) => updateTransition(edge.id, { label: e.target.value })}
                  />
                </label>
              </div>
              {!isRegex && (
                <label className="flex flex-col gap-1 text-xs text-slate-300">
                  <span className="inline-flex items-center gap-1">
                    Advance After Turns
                    <HelpTooltip title="Number of player turns to wait before Story advances automatically." />
                  </span>
                  <input
                    type="number"
                    min={1}
                    className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
                    value={Math.max(1, trigger.within_turns ?? 1)}
                    onChange={(e) => patchTrigger({ within_turns: Math.max(1, Number(e.target.value) || 1) })}
                  />
                </label>
              )}
              {isRegex ? (
                <div className="grid gap-2">
                  <label className="flex flex-col gap-1 text-xs text-slate-300">
                    <span className="inline-flex items-center gap-1">
                      Patterns (one per line)
                      <HelpTooltip title="Regular expressions evaluated against player messages; use /pattern/flags format." />
                    </span>
                    <textarea
                      className="w-full resize-y rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
                      rows={3}
                      value={(trigger.patterns ?? []).join("\n")}
                      onChange={(e) => patchTrigger({ patterns: splitLines(e.target.value) })}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-slate-300">
                    <span className="inline-flex items-center gap-1">
                      Arbiter Condition (LLM only)
                      <HelpTooltip title="Natural-language criteria sent to the Arbiter to determine if this transition should fire." />
                    </span>
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
              <div className="flex justify-end">
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
