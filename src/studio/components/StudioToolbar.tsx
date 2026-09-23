import React, { useRef, useState } from "react";
import { isValidationErrorList } from "@engine/index";
import { availableStoryId, saveStoryRecord } from "@runtime/storyLibrary";
import type { StoryLibraryRecord } from "@runtime/types";
import Toolbar from "@components/studio/Toolbar";
import FeedbackAlert from "@components/studio/FeedbackAlert";
import { useDraftStore } from "../draft";
import { exportDraft, importDraft } from "../io";
import { slugifyStoryId } from "../mutations";

type Feedback = { type: "success" | "error"; message: string } | null;

// What the host does with a saved record. The Studio never reaches into the runtime itself: the
// chat that is playing this story decides whether to take the update (plan 05 hot-swap).
export type StudioSaveHandler = (record: StoryLibraryRecord) => Promise<string | null> | string | null;

const download = (filename: string, text: string) => {
  try {
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  } catch {
    /* download unavailable in this environment */
  }
};

/** The library half of the one save vocabulary, so the two sentences below cannot drift apart. */
const savedTo = (record: StoryLibraryRecord) => `Saved “${record.title}” v${record.version} to the library.`;

const StudioToolbar: React.FC<{ onSaved?: StudioSaveHandler }> = ({ onSaved }) => {
  const draft = useDraftStore((state) => state.draft);
  const dirty = useDraftStore((state) => state.dirty);
  const loadDraft = useDraftStore((state) => state.loadDraft);
  const reset = useDraftStore((state) => state.reset);
  const fileRef = useRef<HTMLInputElement>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [pending, setPending] = useState(false);

  // Re-read the store at action time: the toolbar outlives several draft loads and a captured
  // draft is a stale closure waiting to overwrite the library (ux-eval incident).
  const handleSave = async () => {
    setPending(true);
    const draftNow = useDraftStore.getState().draft;
    const current = draftNow.id ? draftNow : { ...draftNow, id: availableStoryId(slugifyStoryId(draftNow.title)) };
    const result = saveStoryRecord(current);
    if (isValidationErrorList(result)) {
      setPending(false);
      setFeedback({ type: "error", message: `${result.length} validation error(s) block save.` });
      return;
    }
    loadDraft({ ...current, id: result.record.id, version: result.record.version }, result.record.hash);
    // The save itself already succeeded; a failing hand-off must not leave the toolbar stuck on
    // "Saving..." with the author unsure whether the library took the edit.
    try {
      // Two events, two sentences (plan 09 §One save vocabulary). No handler at all means no chat is
      // watching this save, which is not the same as a chat declining it.
      const applied = onSaved ? await onSaved(result.record) : null;
      const chatHalf = !onSaved ? "" : applied ? ` Applied to this chat: ${applied}.` : " Not applied to this chat: it is playing a different story.";
      setFeedback({ type: "success", message: `${savedTo(result.record)}${chatHalf}` });
    } catch (error) {
      setFeedback({ type: "error", message: `${savedTo(result.record)} Not applied to this chat: ${error instanceof Error ? error.message : String(error)}` });
    } finally {
      setPending(false);
    }
  };

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const result = importDraft(await file.text());
    if (isValidationErrorList(result)) {
      setFeedback({ type: "error", message: `Import failed: ${result[0]?.message ?? "invalid story"}` });
      return;
    }
    loadDraft(result);
    setFeedback({ type: "success", message: "Imported story into the draft." });
  };

  return (
    <div className="flex flex-1 flex-wrap items-center gap-2">
      <Toolbar
        hasChanges={dirty}
        savePending={pending}
        canAddTransition={draft.checkpoints.length > 0}
        onExport={() => download(`${draft.id ?? slugifyStoryId(draft.title)}.json`, exportDraft(draft))}
        onImportPick={() => fileRef.current?.click()}
        onReset={reset}
        onSave={() => void handleSave()}
        onSaveAs={() => void handleSave()}
      />
      <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" aria-label="Import story file" onChange={handleFile} />
      <div className="min-w-0 flex-1">
        <FeedbackAlert feedback={feedback} />
      </div>
    </div>
  );
};

export default StudioToolbar;
