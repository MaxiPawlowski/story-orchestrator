import React, { useRef, useState } from "react";
import { isValidationErrorList } from "@engine/index";
import { saveStoryRecord } from "@runtime/storyLibrary";
import Toolbar from "@components/studio/Toolbar";
import FeedbackAlert from "@components/studio/FeedbackAlert";
import { useDraftStore } from "../draft";
import { exportDraft, importDraft } from "../io";

type Feedback = { type: "success" | "error"; message: string } | null;

const slug = (title: string) => title.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "story";

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

const StudioToolbar: React.FC = () => {
  const draft = useDraftStore((state) => state.draft);
  const dirty = useDraftStore((state) => state.dirty);
  const loadDraft = useDraftStore((state) => state.loadDraft);
  const reset = useDraftStore((state) => state.reset);
  const fileRef = useRef<HTMLInputElement>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [pending, setPending] = useState(false);

  const handleSave = () => {
    setPending(true);
    const result = saveStoryRecord(draft);
    setPending(false);
    if (isValidationErrorList(result)) {
      setFeedback({ type: "error", message: `${result.length} validation error(s) block save.` });
      return;
    }
    loadDraft(draft, result.record.hash);
    setFeedback({ type: "success", message: `Saved “${result.record.title}” to library.` });
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
        onExport={() => download(`${slug(draft.title)}.json`, exportDraft(draft))}
        onImportPick={() => fileRef.current?.click()}
        onReset={reset}
        onSave={handleSave}
        onSaveAs={handleSave}
      />
      <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" aria-label="Import story file" onChange={handleFile} />
      <div className="min-w-0 flex-1">
        <FeedbackAlert feedback={feedback} />
      </div>
    </div>
  );
};

export default StudioToolbar;
