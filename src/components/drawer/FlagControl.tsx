import { useState } from "react";
import type { RuntimeManager } from "@runtime/index";
import { PLAYER_COPY } from "@runtime/narrative";
import { Button } from "@components/ui/Button";
import { IconButton } from "@components/ui/IconButton";
import { StatusText } from "@components/ui/StatusText";

export const FLAG_COPY = {
  label: "Flag a moment",
  title: "Flag this moment: it lands in the session journal for review",
  placeholder: "What happened here? (optional)",
  submit: "Flag",
  cancel: "Cancel flag",
} as const;

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
    <Button id="so-flag-moment" icon="fa-flag" title={FLAG_COPY.title} onClick={() => { setFlagged(false); setOpen(true); }}>{FLAG_COPY.label}</Button>
    {flagged && <StatusText as="span" tone="ok" id="so-flag-status" role="status" className="so-play-meta">{PLAYER_COPY.flagged}</StatusText>}
  </>;
  return (
    <div className="so-flag-form">
      <input
        id="so-flag-note"
        className="text_pole"
        autoFocus
        aria-label={FLAG_COPY.placeholder}
        placeholder={FLAG_COPY.placeholder}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") void submit();
          if (event.key === "Escape") { event.stopPropagation(); event.preventDefault(); setOpen(false); }
        }}
      />
      <Button id="so-flag-submit" variant="primary" onClick={() => void submit()}>{FLAG_COPY.submit}</Button>
      <IconButton icon="fa-xmark" label={FLAG_COPY.cancel} onClick={() => { setNote(""); setOpen(false); }} />
    </div>
  );
};

export default FlagControl;
