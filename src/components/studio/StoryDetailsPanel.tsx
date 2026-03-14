import React, { useCallback, useEffect, useState } from "react";
import { StoryDraft } from "@utils/checkpoint-studio";
import { getContext, getAllCharacterNames, listGlobalLorebooks, listGroupMembers } from "@services/STAPI";
import { subscribeToEvents } from "@utils/event-source";
import StoryMetadataSection from "./storyDetails/StoryMetadataSection";
import StoryRolesSection from "./storyDetails/StoryRolesSection";
import StoryDefaultsSection from "./storyDetails/StoryDefaultsSection";

type Props = {
  draft: StoryDraft;
  setDraft: React.Dispatch<React.SetStateAction<StoryDraft>>;
};

const safeFetch = <T,>(fn: () => T, fallback: T): T => {
  try { return fn(); } catch { return fallback; }
};

const StoryDetailsPanel: React.FC<Props> = ({ draft, setDraft }) => {
  const [globalLorebooks, setGlobalLorebooks] = useState<string[]>([]);
  const [groupMembers, setGroupMembers] = useState<string[]>([]);
  const [allCharacters, setAllCharacters] = useState<string[]>([]);

  const refreshGlobalLorebooks = useCallback(() => setGlobalLorebooks(safeFetch(listGlobalLorebooks, [])), []);
  const refreshGroupMembers = useCallback(() => setGroupMembers(safeFetch(listGroupMembers, [])), []);
  const refreshAllCharacters = useCallback(() => setAllCharacters(safeFetch(getAllCharacterNames, [])), []);

  useEffect(() => {
    refreshGlobalLorebooks();
    refreshGroupMembers();
    refreshAllCharacters();

    const { eventSource, eventTypes } = getContext();
    return subscribeToEvents(eventSource, [
      { eventName: eventTypes?.WORLDINFO_SETTINGS_UPDATED, handler: refreshGlobalLorebooks },
      { eventName: eventTypes?.WORLDINFO_UPDATED, handler: refreshGlobalLorebooks },
      { eventName: eventTypes?.CHAT_CHANGED, handler: refreshGroupMembers },
      { eventName: eventTypes?.CHARACTER_DELETED, handler: refreshAllCharacters },
      { eventName: eventTypes?.CHARACTER_EDITED, handler: refreshAllCharacters },
    ]);
  }, [refreshAllCharacters, refreshGlobalLorebooks, refreshGroupMembers]);

  return (
    <div className="flex flex-col gap-4">
      <div className="st-panel shadow-sm">
        <div className="st-panel-header flex items-center justify-between gap-2 px-3 py-2 font-semibold">Story Details</div>
        <div className="flex flex-col gap-3 p-3">
          <StoryMetadataSection draft={draft} setDraft={setDraft} globalLorebooks={globalLorebooks} />
          <StoryRolesSection draft={draft} setDraft={setDraft} groupMembers={groupMembers} allCharacters={allCharacters} />
          <StoryDefaultsSection draft={draft} setDraft={setDraft} />
        </div>
      </div>
    </div>
  );
};

export default StoryDetailsPanel;
