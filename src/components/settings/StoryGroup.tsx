import { useRef, useState } from "react";
import { showChoicePopup, showConfirmPopup } from "@services/STAPI";
import type { RuntimeManager } from "@runtime/index";
import type { RuntimeSnapshot } from "@runtime/types";
import { STORY_STATE_RETENTION } from "@runtime/persistence";
import { exportState } from "@runtime/stateExport";
import { playingStory } from "@runtime/playingStory";
import { removalRestore } from "@runtime/worldInfoScanHost";
import { log } from "@utils/log";
import { PLAYER_COPY } from "@runtime/narrative";
import { ActionStatus, useActionStatus } from "@components/ActionStatus";
import { FieldLabel } from "./Field";
import { SettingRow } from "@components/ui/SettingRow";
import { Select } from "@components/ui/Field";
import { Button } from "@components/ui/Button";
import { IconButton } from "@components/ui/IconButton";
import { busyWork } from "@runtime/busy";

interface StoryGroupProps {
  snapshot: RuntimeSnapshot;
  manager: RuntimeManager;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  importOpen: boolean;
}

const copyState = async (show: (text: string) => void) => {
  await exportState({
    writeClipboard: (text) => navigator.clipboard.writeText(text),
    toast: { success: show, info: show },
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

const useStoryActions = (setBusy: (busy: boolean) => void) => {
  const status = useActionStatus();
  const lock = useRef(false);
  const whileBusy = async (work: () => Promise<unknown>) => {
    if (lock.current) return;
    lock.current = true;
    const job = busyWork.begin("action", null);
    setBusy(true);
    status.show(null);
    try {
      await work();
    } catch (error) {
      log.warn("a story action failed", error);
      status.show(PLAYER_COPY.actionFailed);
    } finally {
      job.end();
      lock.current = false;
      setBusy(false);
    }
  };
  return { status, whileBusy };
};

type StoryPartProps = Omit<StoryGroupProps, "importOpen">;

export const StoryChoice = ({ snapshot, manager, busy, setBusy }: StoryPartProps) => {
  const identity = snapshot.storyIdentity;
  const playing = playingStory(snapshot);
  const noChat = snapshot.noChat ?? null;
  const { status, whileBusy } = useStoryActions(setBusy);

  const selectStory = async (id: string) => {
    if (id) await whileBusy(() => manager.selectStory(id));
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
    <div id="so-chat-story" className="so-setting-group">
      <SettingRow label="Story for this chat" htmlFor="story-library-select"
        description="The chat keeps its own copy, so editing the story later never changes a run in progress. Switching keeps each story's progress."
        control={(describedBy) => <>
          <Select id="story-library-select" size="lg" value={snapshot.storyId ?? ""} disabled={busy || Boolean(noChat)} aria-describedby={describedBy}
            onChange={(event) => void selectStory(event.target.value)}>
            <option value="">Select a story</option>
            {playing && !playing.inLibrary && <option value={playing.id}>{`${playing.title} (pinned copy, not in the library)`}</option>}
            {snapshot.library.map((story) => <option key={story.id} value={story.id}>{story.title}</option>)}
          </Select>
          <IconButton id="so-restart-story" icon="fa-rotate-left" label="Restart story in this chat" aria-busy={busy}
            disabled={busy || (!snapshot.storyId && !snapshot.blobUnreadable)} onClick={() => void whileBusy(() => manager.restartStory())} />
          {snapshot.ui.authorView && <IconButton id="so-delete-story" icon="fa-trash-can" label="Delete selected story from the library"
            disabled={busy || !playing?.inLibrary} onClick={() => void deleteStory()} />}
        </>} />
      <ActionStatus id="so-story-action-status" text={status.text} tone="plain" />
      {noChat && <p id="so-no-chat" role="status" className="so-setting-desc">{noChat.notice}</p>}
      {snapshot.storyId && (
        <p id="so-story-identity" className="so-setting-desc">
          Playing your pinned copy.
          {identity.drifted ? " The library's copy has changed since; this chat keeps playing what it started with." : ""}
          {playing && !playing.inLibrary ? " It is no longer in the library; this chat keeps playing it, and new chats can no longer pick it." : ""}
        </p>
      )}
      {snapshot.blobUnreadable && <p id="so-blob-unreadable" className="so-setting-desc">This chat's saved story state was {snapshot.blobUnreadable.notice}.</p>}
      {snapshot.ui.authorView && snapshot.storyId && <SettingRow id="so-retention-note" label="Export state"
        description={`This chat keeps its progress for the ${STORY_STATE_RETENTION} most recent stories; switching to a sixth drops the oldest.`}
        control={<Button id="so-export-state" size="sm" title="Copy this chat's saved story state to the clipboard, before anything can drop it."
          onClick={() => void copyState((text) => status.show(text))}>Export state</Button>} />}
    </div>
  );
};

export const StoryImport = ({ snapshot, manager, busy, setBusy }: StoryPartProps) => {
  const [importText, setImportText] = useState("");
  const noChat = snapshot.noChat ?? null;
  const { status, whileBusy } = useStoryActions(setBusy);

  const importStory = async () => {
    if (!importText.trim()) return;
    await whileBusy(async () => {
      if (await manager.importStory(importText)) setImportText("");
    });
  };

  const importFile = async (file: File | undefined) => {
    if (file) await whileBusy(async () => manager.importStory(await file.text()));
  };

  return (
    <>
      <div id="so-entry-import" className="flex flex-col gap-1 text-sm">
        <FieldLabel htmlFor="so-import-text" label="Import story (JSON)" help="Paste a story file, or pick one below. It is saved to the library and loaded in this chat." />
        <textarea id="so-import-text" className="text_pole" rows={6} value={importText} onChange={(event) => setImportText(event.target.value)}
          placeholder="Paste story JSON, or pick a file below" />
        <input type="file" aria-label="Import story from a JSON file" accept=".json,application/json" disabled={busy}
          onChange={(event) => { void importFile(event.target.files?.[0]); event.target.value = ""; }} />
        <Button className="self-start" aria-busy={busy} disabled={busy || !importText.trim()}
          onClick={() => void importStory()}>{noChat ? "Save to library" : "Import and load"}</Button>
        <ActionStatus text={status.text} tone="plain" />
      </div>
      {snapshot.validationErrors.length > 0 && (
        <div className="text-xs text-[var(--so-error)]">
          {snapshot.validationErrors.map((error) => <div key={`${error.path}:${error.message}`}>{error.path}: {error.message}</div>)}
        </div>
      )}
    </>
  );
};

export const StoryGroup = ({ importOpen, ...props }: StoryGroupProps) => (
  <>
    <StoryChoice {...props} />
    {importOpen && <StoryImport {...props} />}
  </>
);
