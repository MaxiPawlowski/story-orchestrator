import React from "react";
import { StoryDraft } from "../checkpoint-studio.helpers";

type Props = {
  draft: StoryDraft;
  setDraft: React.Dispatch<React.SetStateAction<StoryDraft>>;
};

const StoryDetailsPanel: React.FC<Props> = ({ draft, setDraft }) => {
  return (
    <div className="rounded-lg border border-slate-800 bg-[var(--SmartThemeBlurTintColor)] shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-slate-800 px-3 py-2 font-semibold">Story Details</div>
      <div className="flex flex-col gap-3 p-3">
        <label className="flex flex-col gap-1 text-xs text-slate-300">
          <span>Title</span>
          <input
            className="w-full rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
            value={draft.title}
            onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-300">
          <span>Global Lorebook</span>
          <input
            className="w-full rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
            value={draft.global_lorebook}
            onChange={(e) => setDraft((prev) => ({ ...prev, global_lorebook: e.target.value }))}
          />
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
    </div>
  );
};

export default StoryDetailsPanel;

