import { useState } from "react";
import { showChoicePopup, showConfirmPopup } from "@services/STAPI";
import type { RuntimeManager } from "@runtime/index";
import type { RuntimeSnapshot } from "@runtime/types";
import { STORY_STATE_RETENTION } from "@runtime/persistence";
import { exportState } from "@runtime/stateExport";
import { playingStory } from "@runtime/playingStory";
import { removalRestore } from "@runtime/worldInfoScanHost";
import { log } from "@utils/log";

interface StoryGroupProps {
  snapshot: RuntimeSnapshot;
  manager: RuntimeManager;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  importOpen: boolean;
}

const copyState = async () => {
  await exportState({
    writeClipboard: (text) => navigator.clipboard.writeText(text),
    toast: window.toastr ?? {},
    log: (text) => log.info(text),
  });
};

const deletionChoice = async (title: string, storyId: string) => {
  const question = `Delete "${title}" from the library? Chats already playing it keep their own pinned copy and carry on; new chats can no longer pick it.`;
  const restore = removalRestore(storyId);
  if (!restore) return { choice: (await showConfirmPopup(question, { okButton: "Delete", cancelButton: "Keep", safeDefault: true })) ? "delete" : null, restore };
  const entries = `Its ${restore.entries} lorebook ${restore.entries === 1 ? "entry stays" : "entries stay"} off at rest unless you restore ${restore.entries === 1 ? "it" : "them"}.`;
  const choice = await showChoicePopup(`${question} ${entries}`, {
    okButton: { id: "delete", label: "Delete" },
    choices: [{ id: "restore", label: "Delete and restore these lorebook entries" }],
    cancelButton: "Keep",
    safeDefault: true,
  });
  return { choice, restore };
};

export const StoryGroup = ({ snapshot, manager, busy, setBusy, importOpen }: StoryGroupProps) => {
  const [importText, setImportText] = useState("");
  const identity = snapshot.storyIdentity;
  const playing = playingStory(snapshot);
  const noChat = snapshot.noChat ?? null;

  const whileBusy = async (work: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await work();
    } catch (error) {
      log.warn("a story action failed", error);
      window.toastr?.info?.("That did not finish. Try again, or reload SillyTavern.", "Story Orchestrator");
    } finally {
      setBusy(false);
    }
  };

  const selectStory = async (id: string) => {
    if (id) await whileBusy(() => manager.selectStory(id));
  };

  const importStory = async () => {
    if (!importText.trim()) return;
    await whileBusy(async () => {
      if (await manager.importStory(importText)) setImportText("");
    });
  };

  const importFile = async (file: File | undefined) => {
    if (file) await whileBusy(async () => manager.importStory(await file.text()));
  };

  const deleteStory = async () => {
    const current = manager.getSnapshot();
    const active = current.library.find((story) => story.id === current.storyId);
    if (!active) return;
    const { choice, restore } = await deletionChoice(active.title, active.id);
    if (!choice) return;
    await whileBusy(async () => {
      const removed = await manager.removeStory(active.id);
      if (removed && choice === "restore" && restore) await restore.run();
    });
  };

  return (
    <>
      <div className="flex flex-col gap-1 text-sm">
        <label htmlFor="story-library-select">Story for this chat</label>
        <div className="flex items-center gap-2">
          <select id="story-library-select" className="flex-1" value={snapshot.storyId ?? ""} disabled={busy || Boolean(noChat)} onChange={(event) => void selectStory(event.target.value)}>
            <option value="">Select a story</option>
            {playing && !playing.inLibrary && <option value={playing.id}>{`${playing.title} (pinned copy, not in the library)`}</option>}
            {snapshot.library.map((story) => <option key={story.id} value={story.id}>{story.title}</option>)}
          </select>
          <button
            id="so-restart-story"
            type="button"
            className="menu_button fa-solid fa-rotate-left"
            aria-label="Restart story in this chat"
            title="Restart this story in this chat (clears progress and memory for it)"
            disabled={busy || (!snapshot.storyId && !snapshot.blobUnreadable)}
            onClick={() => void whileBusy(() => manager.restartStory())}
          />
          {snapshot.ui.authorView && <button
            id="so-delete-story"
            type="button"
            className="menu_button fa-solid fa-trash-can"
            aria-label="Delete selected story from the library"
            title="Delete the selected story from the library"
            disabled={busy || !playing?.inLibrary}
            onClick={() => void deleteStory()}
          />}
        </div>
        {noChat && <div id="so-no-chat" role="status" className="text-xs opacity-90">{noChat.notice}</div>}
        {snapshot.storyId && (
          <div id="so-story-identity" className="text-xs opacity-70">
            Playing your pinned copy{identity.playedVersion ? ` (v${identity.playedVersion})` : ""}.
            {identity.drifted && identity.libraryVersion ? ` The library has a newer version (v${identity.libraryVersion}); this chat keeps playing what it started with.` : ""}
            {playing && !playing.inLibrary ? " It is no longer in the library; this chat keeps playing it, and new chats can no longer pick it." : ""}
          </div>
        )}
        {snapshot.blobUnreadable && <div id="so-blob-unreadable" className="text-xs opacity-90">This chat's saved story state was {snapshot.blobUnreadable.notice}.</div>}
        {snapshot.ui.authorView && snapshot.storyId && <div id="so-retention-note" className="text-xs opacity-70 flex items-center gap-2">
          <span className="min-w-0 flex-1">This chat keeps its progress for the {STORY_STATE_RETENTION} most recent stories; switching to a sixth drops the oldest.</span>
          <button
            id="so-export-state"
            type="button"
            className="menu_button shrink-0 whitespace-nowrap"
            title="Copy this chat's saved story state to the clipboard, before anything can drop it."
            onClick={() => void copyState()}
          >Export state</button>
        </div>}
      </div>
      {importOpen && (
        <div id="so-entry-import" className="flex flex-col gap-1 text-sm">
          <label htmlFor="so-import-text">Import story (JSON)</label>
          <textarea id="so-import-text" className="text_pole" rows={6} value={importText} onChange={(event) => setImportText(event.target.value)}
            placeholder="Paste story JSON, or pick a file below" />
          <input type="file" aria-label="Import story from a JSON file" accept=".json,application/json" disabled={busy}
            onChange={(event) => { void importFile(event.target.files?.[0]); event.target.value = ""; }} />
          <button type="button" className="menu_button self-start" disabled={busy || !importText.trim()} onClick={() => void importStory()}>{noChat ? "Save to library" : "Import and load"}</button>
        </div>
      )}
      {snapshot.validationErrors.length > 0 && (
        <div className="text-xs text-red-400">
          {snapshot.validationErrors.map((error) => <div key={`${error.path}:${error.message}`}>{error.path}: {error.message}</div>)}
        </div>
      )}
    </>
  );
};
