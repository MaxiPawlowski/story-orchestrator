import React, { useCallback, useEffect, useState } from "react";
import MultiSelect from "@components/studio/MultiSelect";
import {
  type CheckpointDraft,
  type StoryDraft,
} from "@utils/checkpoint-studio";
import { getContext, listLorebookComments } from "@services/STAPI";
import { subscribeToEvents } from "@utils/event-source";
import HelpTooltip from "../../HelpTooltip";

type Props = {
  draft: StoryDraft;
  checkpoint: CheckpointDraft;
  updateCheckpoint: (id: string, updater: (cp: CheckpointDraft) => CheckpointDraft) => void;
};

const WorldInfoTab: React.FC<Props> = ({ draft, checkpoint, updateCheckpoint }) => {
  const [loreComments, setLoreComments] = useState<string[]>([]);

  const refreshLoreEntries = useCallback(async () => {
    try {
      setLoreComments(await listLorebookComments(draft.global_lorebook ?? ""));
    } catch (err) {
      console.warn("[Story - CheckpointEditor] Failed to load world info entries", err);
      setLoreComments([]);
    }
  }, [draft.global_lorebook]);

  useEffect(() => {
    void refreshLoreEntries();
    const { eventSource, eventTypes } = getContext();
    return subscribeToEvents(eventSource, [
      { eventName: eventTypes?.WORLDINFO_ENTRIES_LOADED, handler: refreshLoreEntries },
      { eventName: eventTypes?.WORLDINFO_UPDATED, handler: refreshLoreEntries },
      { eventName: eventTypes?.WORLDINFO_SETTINGS_UPDATED, handler: refreshLoreEntries },
    ]);
  }, [refreshLoreEntries]);

  const buildEntryOptions = useCallback((selected: string[] | undefined) => {
    const base = [...loreComments];
    const extra = (selected ?? []).filter((value) => value && !base.includes(value));
    return [
      ...base.map((value) => ({ value, label: value })),
      ...extra.map((value) => ({ value, label: `${value} (not in lorebook)` })),
    ];
  }, [loreComments]);

  return (
    <div className="space-y-2">
      <div className="font-medium">World Info</div>
      <label className="flex flex-col gap-1 text-xs">
        <span className="inline-flex items-center gap-1">
          Activate
          <HelpTooltip title="Turn on these lore entries as soon as the checkpoint activates." />
        </span>
        <MultiSelect
          options={buildEntryOptions(checkpoint.world_info)}
          value={checkpoint.world_info ?? []}
          onChange={(values) => {
            updateCheckpoint(checkpoint.id, (cp) => ({
              ...cp,
              world_info: values.length ? values : undefined,
            }));
          }}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        <span className="inline-flex items-center gap-1">
          Deactivate
          <HelpTooltip title="Manually disable additional lore entries when entering this checkpoint (auto-deactivation already handles other checkpoints' entries)." />
        </span>
        <MultiSelect
          options={buildEntryOptions(checkpoint.world_info_deactivate)}
          value={checkpoint.world_info_deactivate ?? []}
          onChange={(values) => {
            updateCheckpoint(checkpoint.id, (cp) => ({
              ...cp,
              world_info_deactivate: values.length ? values : undefined,
            }));
          }}
        />
      </label>
    </div>
  );
};

export default WorldInfoTab;
