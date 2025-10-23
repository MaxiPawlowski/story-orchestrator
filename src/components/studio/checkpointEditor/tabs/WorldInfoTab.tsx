import React from "react";
import MultiSelect from "@components/studio/MultiSelect";
import {
  cleanupOnActivate,
  ensureOnActivate,
  type CheckpointDraft,
  type StoryDraft,
} from "@utils/checkpoint-studio";
import { getContext, eventSource, event_types } from "@services/SillyTavernAPI";
import { subscribeToEventSource } from "@utils/eventSource";

type Props = {
  draft: StoryDraft;
  checkpoint: CheckpointDraft;
  updateCheckpoint: (id: string, updater: (cp: CheckpointDraft) => CheckpointDraft) => void;
};

const WorldInfoTab: React.FC<Props> = ({ draft, checkpoint, updateCheckpoint }) => {
  const [loreComments, setLoreComments] = React.useState<string[]>([]);

  const refreshLoreEntries = React.useCallback(async () => {
    const lorebook = (draft.global_lorebook || "").trim();
    if (!lorebook) { setLoreComments([]); return; }
    try {
      const { loadWorldInfo } = getContext();
      const res: any = await loadWorldInfo(lorebook);
      const entries = res?.entries ?? {};
      const comments = Object.values(entries)
        .map((entry: any) => (typeof entry?.comment === "string" ? entry.comment.trim() : ""))
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
        event_types?.WORLDINFO_SETTINGS_UPDATED,
      ].forEach((eventName) => {
        if (!eventName) return;
        const off = subscribeToEventSource({ source: eventSource, eventName, handler });
        offs.push(off);
      });
    } catch (err) {
      console.warn("[CheckpointEditor] Failed to subscribe to WI events", err);
    }
    return () => {
      while (offs.length) {
        try { offs.pop()?.(); } catch { /* noop */ }
      }
    };
  }, [refreshLoreEntries]);

  const buildEntryOptions = React.useCallback((selected: string[] | undefined) => {
    const base = loreComments.slice();
    const extra = (selected ?? []).filter((value) => value && !base.includes(value));
    return [
      ...base.map((value) => ({ value, label: value })),
      ...extra.map((value) => ({ value, label: `${value} (not in lorebook)` })),
    ];
  }, [loreComments]);

  return (
    <div className="space-y-2">
      <div className="font-medium">World Info</div>
      <label className="flex flex-col gap-1 text-xs text-slate-300">
        <span>Activate</span>
        <MultiSelect
          options={buildEntryOptions(checkpoint.on_activate?.world_info?.activate)}
          value={checkpoint.on_activate?.world_info?.activate ?? []}
          onChange={(values) => {
            updateCheckpoint(checkpoint.id, (cp) => {
              const next = ensureOnActivate(cp.on_activate);
              next.world_info.activate = values;
              return { ...cp, on_activate: cleanupOnActivate(next) };
            });
          }}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-slate-300">
        <span>Deactivate</span>
        <MultiSelect
          options={buildEntryOptions(checkpoint.on_activate?.world_info?.deactivate)}
          value={checkpoint.on_activate?.world_info?.deactivate ?? []}
          onChange={(values) => {
            updateCheckpoint(checkpoint.id, (cp) => {
              const next = ensureOnActivate(cp.on_activate);
              next.world_info.deactivate = values;
              return { ...cp, on_activate: cleanupOnActivate(next) };
            });
          }}
        />
      </label>
    </div>
  );
};

export default WorldInfoTab;

