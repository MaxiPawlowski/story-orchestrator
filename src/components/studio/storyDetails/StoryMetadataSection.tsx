import React from "react";
import type { StoryDraft } from "@utils/checkpoint-studio";

type Props = {
  draft: StoryDraft;
  setDraft: React.Dispatch<React.SetStateAction<StoryDraft>>;
  globalLorebooks: string[];
};

const StoryMetadataSection: React.FC<Props> = ({ draft, setDraft, globalLorebooks }) => {
  const lorebookOptions = React.useMemo(() => {
    const current = (draft.global_lorebook || "").trim();
    const base = globalLorebooks.slice();
    if (current && !base.includes(current)) {
      return [{ value: current, label: `${current} (inactive)` }, ...base.map((value) => ({ value, label: value }))];
    }
    return base.map((value) => ({ value, label: value }));
  }, [draft.global_lorebook, globalLorebooks]);

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-xs text-slate-300">
        <span>Title</span>
        <input
          className="w-full rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
          value={draft.title}
          onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-slate-300">
        <span>Story Description</span>
        <textarea
          className="w-full resize-y rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
          rows={4}
          value={draft.description ?? ""}
          onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))}
          placeholder="Summarize the campaign backdrop that the Arbiter sees."
        />
        <span className="text-[11px] text-slate-400">
          Exposed to prompts via <code className="font-mono text-[11px] text-slate-300">{`{{story_description}}`}</code>.
        </span>
      </label>
      <label className="flex flex-col gap-1 text-xs text-slate-300">
        <span>Global Lorebook</span>
        <select
          className="w-full rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
          value={draft.global_lorebook}
          onChange={(e) => setDraft((prev) => ({ ...prev, global_lorebook: e.target.value }))}
        >
          <option value="">Select active global lorebook…</option>
          {lorebookOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-slate-300">
        <span>Start Checkpoint</span>
        <select
          className="w-full rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
          value={draft.start}
          onChange={(e) => setDraft((prev) => ({ ...prev, start: e.target.value }))}
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
  );
};

export default StoryMetadataSection;

