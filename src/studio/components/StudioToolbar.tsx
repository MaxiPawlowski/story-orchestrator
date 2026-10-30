import React, { useEffect, useRef, useState } from "react";
import { isValidationErrorList } from "@engine/index";
import { availableStoryId, confirmLibrarySave, saveStoryRecord } from "@runtime/storyLibrary";
import { chatSaveHalf, librarySaveSentence, type ChatSaveAnswer, type LibrarySaveEvidence } from "@runtime/librarySave";
import type { StoryLibraryRecord } from "@runtime/types";
import { Callout } from "@components/ui/Callout";
import { Button } from "@components/ui/Button";
import { IconButton } from "@components/ui/IconButton";
import { draftKeyFor, useDraftStore } from "../draft";
import { exportDraft, importDraft } from "../io";
import { toMermaid } from "../graphAdapter";
import { slugifyStoryId } from "@engine/index";
import { log } from "@utils/log";
import "../mobile.css";

type Feedback = { type: "success" | "error"; message: string; blocked?: boolean } | null;

// What the host does with a saved record. The Studio never reaches into the runtime itself: the
// chat that is playing this story decides whether to take the update (hot-swap).
export type StudioSaveHandler = (record: StoryLibraryRecord) => Promise<ChatSaveAnswer> | ChatSaveAnswer;

const download = (filename: string, text: string) => {
  try {
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    log.warn("studio: the story file could not be downloaded here", error);
  }
};

interface Props {
  onSaved?: StudioSaveHandler;
  onRekeySession?: (from: string, to: string) => void;
  confirmSave?: (record: StoryLibraryRecord) => Promise<LibrarySaveEvidence>;
}

interface MenuEntry { id: string; label: string; icon: string; disabled?: boolean; run: () => void }

const OverflowMenu = ({ entries }: { entries: MenuEntry[] }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return undefined;
    const outside = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", outside, true);
    rootRef.current?.querySelector<HTMLButtonElement>("[role=menuitem]:not(:disabled)")?.focus();
    return () => document.removeEventListener("pointerdown", outside, true);
  }, [open]);
  const choose = (entry: MenuEntry) => {
    setOpen(false);
    rootRef.current?.querySelector<HTMLButtonElement>("#so-studio-more")?.focus();
    entry.run();
  };
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape" && open) { event.stopPropagation(); event.preventDefault(); setOpen(false); rootRef.current?.querySelector<HTMLButtonElement>("#so-studio-more")?.focus(); return; }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const items = [...(rootRef.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]:not(:disabled)") ?? [])];
    if (!items.length) return;
    event.preventDefault();
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    items[(at + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length].focus();
  };
  return (
    <div ref={rootRef} className="so-studio-menu" onKeyDown={onKeyDown}>
      <IconButton id="so-studio-more" icon="fa-ellipsis" label="More studio actions" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} />
      {open && <div role="menu" aria-label="More studio actions" className="so-studio-menu-list">
        {entries.map((entry) => <button key={entry.id} id={entry.id} type="button" role="menuitem" className="so-studio-menu-item" disabled={entry.disabled}
          onClick={() => choose(entry)}><i aria-hidden="true" className={`fa-solid ${entry.icon}`} />{entry.label}</button>)}
      </div>}
    </div>
  );
};

const StudioToolbar: React.FC<Props> = ({ onSaved, onRekeySession, confirmSave = confirmLibrarySave }) => {
  const draft = useDraftStore((state) => state.draft);
  const dirty = useDraftStore((state) => state.dirty);
  const loadDraft = useDraftStore((state) => state.loadDraft);
  const blocked = useDraftStore((state) => state.errors.length);
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
      setFeedback({ type: "error", message: `${result.length} validation error(s) block save.`, blocked: true });
      return;
    }
    const saved = { ...current, id: result.record.id };
    const draftKey = useDraftStore.getState().draftKey;
    const storyKey = draftKeyFor(saved);
    if (onRekeySession && storyKey !== draftKey) onRekeySession(draftKey, storyKey);
    loadDraft(saved, result.record.hash, onRekeySession ? storyKey : draftKey, { keepSelection: true });
    // The library half says "Saved" only on evidence the server holds the record. The
    // write armed that evidence and the runtime journals it; this reads the same one.
    const evidence = confirmSave(result.record);
    // A failing hand-off must not leave the toolbar stuck on "Saving..." with the author unsure
    // whether the library took the edit.
    let chatHalf = "";
    let chatFailed = false;
    try {
      // Two events, two sentences (save vocabulary). No handler at all means no chat is
      // watching this save, which is not the same as a chat declining it.
      const taken = onSaved ? await onSaved(result.record) : null;
      chatHalf = chatSaveHalf(Boolean(onSaved), taken);
    } catch (error) {
      chatHalf = ` Not applied to this chat: ${error instanceof Error ? error.message : String(error)}`;
      chatFailed = true;
    }
    const library = await evidence.catch((error: unknown): LibrarySaveEvidence => ({ confirmed: false, reason: error instanceof Error ? error.message : String(error) }));
    setFeedback({ type: library.confirmed && !chatFailed ? "success" : "error", message: `${librarySaveSentence(result.record, library)}${chatHalf}` });
    setPending(false);
  };

  const handleCopyMermaid = async () => {
    try {
      await navigator.clipboard?.writeText(toMermaid(useDraftStore.getState().draft));
      setFeedback({ type: "success", message: "Copied the Mermaid source of the graph." });
    } catch {
      setFeedback({ type: "error", message: "The clipboard refused the Mermaid source here." });
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

  const shown = feedback?.blocked && !blocked ? null : feedback;
  const entries: MenuEntry[] = [
    { id: "so-studio-save-as", label: "Save As", icon: "fa-copy", disabled: pending, run: () => void handleSave() },
    { id: "so-studio-export", label: "Export JSON", icon: "fa-file-export", disabled: draft.checkpoints.length === 0,
      run: () => download(`${draft.id ?? slugifyStoryId(draft.title)}.json`, exportDraft(draft)) },
    { id: "so-studio-import", label: "Import JSON", icon: "fa-file-import", run: () => fileRef.current?.click() },
    { id: "so-studio-mermaid", label: "Copy Mermaid source", icon: "fa-diagram-project", disabled: draft.checkpoints.length === 0, run: () => void handleCopyMermaid() },
    { id: "so-studio-reset", label: "Reset draft", icon: "fa-rotate-left", disabled: !dirty, run: reset },
  ];
  return (
    <div className="so-studio-actions">
      {dirty && <span id="so-draft-unsaved" className="so-studio-unsaved" role="status">Unsaved</span>}
      <Button id="so-studio-save" variant="primary" icon="fa-floppy-disk" aria-busy={pending || undefined} onClick={() => void handleSave()}>{pending ? "Saving..." : "Save"}</Button>
      <OverflowMenu entries={entries} />
      <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" aria-label="Import story file" onChange={handleFile} />
      {shown && <div data-so="studio-feedback" className="so-studio-feedback">
        <Callout role={shown.type === "error" ? "alert" : "status"} tone={shown.type === "success" ? "ok" : "error"}><p>{shown.message}</p></Callout>
        <IconButton icon="fa-xmark" size="sm" label="Dismiss" onClick={() => setFeedback(null)} />
      </div>}
    </div>
  );
};

export default StudioToolbar;
