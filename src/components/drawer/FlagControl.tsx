import { useState } from "react";
import type { RuntimeManager } from "@runtime/index";
import { PLAYER_COPY } from "@runtime/narrative";

export const FlagControl = ({ manager }: { manager: Pick<RuntimeManager, "flagMoment"> }) => {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [flagged, setFlagged] = useState(false);

  const submit = async () => {
    await manager.flagMoment(note);
    setNote("");
    setOpen(false);
    setFlagged(true);
  };

  if (!open) return <>
    <button
      id="so-flag-moment"
      className="menu_button opacity-70"
      title="Flag this moment — it lands in the session journal for review"
      aria-label="Flag this moment"
      onClick={() => { setFlagged(false); setOpen(true); }}
    >⚑</button>
    {flagged && <span id="so-flag-status" role="status" className="text-xs so-success-text">{PLAYER_COPY.flagged}</span>}
  </>;
  return (
    <div className="flex items-center gap-1 flex-1">
      <input
        id="so-flag-note"
        className="text_pole flex-1"
        autoFocus
        placeholder="What happened here? (optional)"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") void submit();
          if (event.key === "Escape") { event.stopPropagation(); event.preventDefault(); setOpen(false); }
        }}
      />
      <button id="so-flag-submit" className="menu_button" onClick={() => void submit()}>Flag</button>
      <button className="menu_button opacity-70" aria-label="Cancel flag" onClick={() => { setNote(""); setOpen(false); }}>✕</button>
    </div>
  );
};

export default FlagControl;
