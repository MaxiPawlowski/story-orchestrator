import { useCallback, useMemo, useState } from "react";
import { useExtensionSettings } from "@components/context/ExtensionSettingsContext";
import { useStoryContext } from "@hooks/useStoryContext";
import CheckpointStudioModal from "@components/settings/CheckpointStudio/CheckpointStudioModal";
import { storySessionStore } from "@store/storySessionStore";
import { makeDefaultState, persistStoryState } from "@utils/story-state";

const SettingsWrapper = () => {
  const [isOpen, setIsOpen] = useState(false);
  const {
    arbiterPrompt,
    arbiterFrequency,
    defaultArbiterPrompt,
    setArbiterPrompt,
    setArbiterFrequency,
    resetArbiterPrompt,
  } = useExtensionSettings();

  const isPromptDefault = useMemo(() => arbiterPrompt === defaultArbiterPrompt, [arbiterPrompt, defaultArbiterPrompt]);
  const {
    story,
    validate,
    loading: libraryLoading,
    libraryEntries,
    selectedLibraryKey,
    selectedLibraryError,
    selectLibraryEntry,
    reloadLibrary,
    saveLibraryStory,
    deleteLibraryStory,
  } = useStoryContext();
  const [showEditor, setShowEditor] = useState(false);
  const selectedLibraryEntry = useMemo(() => {
    if (!selectedLibraryKey) return null;
    return libraryEntries.find((entry) => entry.key === selectedLibraryKey) ?? null;
  }, [libraryEntries, selectedLibraryKey]);

  const handleStorySelect = useCallback((nextKey: string) => {
    if (!nextKey) return;
    if (nextKey === selectedLibraryKey) return;

    if (selectedLibraryKey) {
      const confirmed = window.confirm(
        "Switching the active story will reset checkpoint progress and status tracking for this chat. Continue?",
      );
      if (!confirmed) {
        return;
      }
    }

    try {
      storySessionStore.getState().setStoryKey(nextKey);
    } catch (err) {
      console.warn("[Settings] Failed to sync story key before selection", err);
    }

    const entry = libraryEntries.find((candidate) => candidate.key === nextKey);
    if (entry?.ok && entry.story) {
      const { chatId, groupChatSelected } = storySessionStore.getState();
      if (groupChatSelected && chatId) {
        try {
          const defaultRuntime = makeDefaultState(entry.story);
          persistStoryState({
            chatId,
            story: entry.story,
            state: defaultRuntime,
            storyKey: nextKey,
          });
        } catch (persistErr) {
          console.warn("[Settings] Failed to persist story selection", persistErr);
        }
      }
    }

    selectLibraryEntry(nextKey);
  }, [libraryEntries, selectLibraryEntry, selectedLibraryKey]);


  return (
    <div id="stepthink_settings">
      <div className="inline-drawer">
        <div
          className="inline-drawer-toggle inline-drawer-header flex items-center justify-between"
          onClick={() => setIsOpen((prev) => !prev)}
        >
          <b>Project Story</b>
          <div
            className={`inline-drawer-icon fa-solid fa-circle-chevron-${isOpen ? "down" : "up"} ${isOpen ? "down" : "up"}`}
          />
        </div>
        {isOpen && (
          <div className="inline-drawer-content px-3 py-2 !flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="story-library-select" className="text-sm font-medium">
                  Active Story
                </label>
                <button
                  type="button"
                  className="text-xs px-2 py-1 border rounded bg-transparent"
                  onClick={() => reloadLibrary()}
                  disabled={libraryLoading}
                >
                  {libraryLoading ? "Refreshing…" : "Refresh"}
                </button>
              </div>
              <select
                id="story-library-select"
                className="text_pole"
                value={selectedLibraryKey ?? ""}
                onChange={(event) => {
                  const { value } = event.target;
                  if (!value) return;
                  handleStorySelect(value);
                }}
                disabled={!libraryEntries.length}
              >
                {!libraryEntries.length && <option value="">No stories found</option>}
                {libraryEntries.length > 0 && <option value="" disabled>Select a story</option>}
                {libraryEntries.map((entry) => (
                  <option key={entry.key} value={entry.key} title={entry.ok ? entry.label : entry.error ?? entry.label}>
                    {entry.label}
                    {entry.ok ? "" : " — Invalid"}
                  </option>
                ))}
              </select>
              {selectedLibraryError && (
                <p className="text-xs text-red-400">
                  {selectedLibraryError}
                </p>
              )}
              {selectedLibraryEntry && selectedLibraryEntry.ok && selectedLibraryEntry.story && (
                <div className="text-xs opacity-70">
                  <span>
                    {selectedLibraryEntry.story.title ?? "Untitled Story"}
                  </span>
                  {selectedLibraryEntry.meta?.name && selectedLibraryEntry.meta.name !== selectedLibraryEntry.story.title && (
                    <span>{` · ${selectedLibraryEntry.meta.name}`}</span>
                  )}
                </div>
              )}
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                className="text-xs px-2 py-1 border rounded bg-transparent"
                onClick={() => setShowEditor((prev) => !prev)}
              >
                {showEditor ? "Hide Editor" : "Open Editor"}
              </button>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="story-arbiter-frequency" className="text-sm font-medium">
                Arbiter Frequency (turns)
              </label>
              <input
                id="story-arbiter-frequency"
                type="number"
                min={1}
                max={99}
                className="text_pole"
                value={arbiterFrequency}
                onChange={(event) => {
                  const next = Number.parseInt(event.target.value, 10);
                  setArbiterFrequency(Number.isFinite(next) ? next : 1);
                }}
              />
              <p className="text-xs opacity-70">
                Runs interval evaluations after this many player turns when no triggers fire.
              </p>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="story-arbiter-prompt" className="text-sm font-medium">
                Arbiter Prompt
              </label>
              <textarea
                id="story-arbiter-prompt"
                className="text_pole textarea_compact"
                rows={6}
                value={arbiterPrompt}
                onChange={(event) => setArbiterPrompt(event.target.value)}
              />
              <div className="flex items-center justify-between text-xs opacity-70">
                <span>Custom instructions prepended to Arbiter evaluations.</span>
                <button
                  type="button"
                  className="menu_button px-2 py-1"
                  onClick={resetArbiterPrompt}
                  disabled={isPromptDefault}
                >
                  Reset
                </button>
              </div>
            </div>
          </div>
        )}
        <CheckpointStudioModal
          open={showEditor}
          onClose={() => setShowEditor(false)}
          sourceStory={story}
          validate={validate}
          libraryEntries={libraryEntries}
          selectedKey={selectedLibraryKey}
          selectedError={selectedLibraryError}
          onSelectKey={selectLibraryEntry}
          onSaveStory={saveLibraryStory}
          onDeleteStory={deleteLibraryStory}
        />
      </div>
    </div>
  );
};

export default SettingsWrapper;
