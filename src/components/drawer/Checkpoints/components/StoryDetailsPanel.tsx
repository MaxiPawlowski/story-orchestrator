import React from "react";
import { StoryDraft } from "../checkpoint-studio.helpers";
import { getWorldInfoSettings, eventSource, event_types } from "@services/SillyTavernAPI";
import { subscribeToEventSource } from "@utils/eventSource";

type Props = {
  draft: StoryDraft;
  setDraft: React.Dispatch<React.SetStateAction<StoryDraft>>;
};

const StoryDetailsPanel: React.FC<Props> = ({ draft, setDraft }) => {
  const [globalLorebooks, setGlobalLorebooks] = React.useState<string[]>([]);

  const refreshGlobalLorebooks = React.useCallback(() => {
    try {
      const settings: any = getWorldInfoSettings?.();
      const list = Array.isArray(settings?.world_info?.globalSelect)
        ? (settings.world_info.globalSelect as unknown[])
            .map((g) => (typeof g === "string" ? g.trim() : ""))
            .filter(Boolean)
        : [];
      setGlobalLorebooks(list);
    } catch (err) {
      console.warn("[CheckpointStudio] Failed to read global lorebooks", err);
      setGlobalLorebooks([]);
    }
  }, []);

  React.useEffect(() => {
    // initial read
    refreshGlobalLorebooks();

    // listen to world info setting changes to keep the list in sync
    const offs: Array<() => void> = [];
    const handler = () => refreshGlobalLorebooks();
    try {
      [
        event_types?.WORLDINFO_SETTINGS_UPDATED,
        event_types?.WORLDINFO_UPDATED,
      ].forEach((eventName) => {
        if (!eventName) return;
        const off = subscribeToEventSource({ source: eventSource, eventName, handler });
        offs.push(off);
      });
    } catch (err) {
      console.warn("[CheckpointStudio] Failed to subscribe to WI events", err);
    }

    return () => {
      while (offs.length) {
        try { offs.pop()?.(); } catch {}
      }
    };
  }, [refreshGlobalLorebooks]);

  const options = React.useMemo(() => {
    const current = (draft.global_lorebook || "").trim();
    const base = globalLorebooks.slice();
    if (current && !base.includes(current)) {
      return [{ value: current, label: `${current} (inactive)` }, ...base.map((v) => ({ value: v, label: v }))];
    }
    return base.map((v) => ({ value: v, label: v }));
  }, [draft.global_lorebook, globalLorebooks]);
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
          <select
            className="w-full rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
            value={draft.global_lorebook}
            onChange={(e) => setDraft((prev) => ({ ...prev, global_lorebook: e.target.value }))}
          >
            <option value="">Select active global lorebook…</option>
            {options.map((opt) => (
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
    </div>
  );
};

export default StoryDetailsPanel;
