import { useState } from "react";
import { FieldLabel } from "./Field";

export interface LivingStartFields {
  title: string;
  premise: string;
  tone: string;
  playerRole: string;
}

export const LIVING_PREMISE_MIN = 20;

const FIELDS: Array<{ key: keyof LivingStartFields; id: string; label: string; help: string; long?: boolean }> = [
  { key: "title", id: "so-living-start-title", label: "Title", help: "The story's name in the library. Left empty, it is called \"A living story\"." },
  { key: "premise", id: "so-living-start-premise", label: "Premise", help: "The situation the story starts from, in a sentence or two. Every turning point is written from it.", long: true },
  { key: "tone", id: "so-living-start-tone", label: "Tone (optional)", help: "A few words for how the story should feel, such as \"quiet, salt-worn\"." },
  { key: "playerRole", id: "so-living-start-role", label: "Who you play (optional)", help: "One line about your part in the story, such as \"a newcomer at the harbour inn\"." },
];

export const LivingStart = ({ busy, onStart }: { busy: boolean; onStart(fields: LivingStartFields): Promise<boolean> }) => {
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState<LivingStartFields>({ title: "", premise: "", tone: "", playerRole: "" });
  const [note, setNote] = useState<string | null>(null);
  const set = (key: keyof LivingStartFields) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setFields({ ...fields, [key]: event.target.value });
  const ready = fields.premise.trim().length >= LIVING_PREMISE_MIN;
  const start = async () => {
    const ok = await onStart(fields);
    setNote(ok ? "Started. The story writes its next turning point as you play." : "Not started. The status line above says why.");
  };
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <button id="so-living-start-toggle" type="button" className="menu_button" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Hide premise" : "Start from a premise"}</button>
      </div>
      {open && (
        <div id="so-living-start" className="flex flex-col gap-1 text-xs">
          {FIELDS.map((field) => (
            <div key={field.key} className="flex flex-col">
              <FieldLabel htmlFor={field.id} label={field.label} help={field.help} />
              {field.long
                ? <textarea id={field.id} className="text_pole" rows={4} value={fields[field.key]} onChange={set(field.key)} />
                : <input id={field.id} className="text_pole" value={fields[field.key]} onChange={set(field.key)} />}
            </div>
          ))}
          <div className="opacity-70">The cast is this group. Nothing is written ahead: the story writes its next turning point as you play.</div>
          <div className="flex flex-wrap items-center gap-2">
            <button id="so-living-start-go" type="button" className="menu_button" disabled={busy || !ready} onClick={() => void start()}>Start the story</button>
            {!ready && <span className="opacity-70">Write a premise of a sentence or two first.</span>}
          </div>
          {note && <div data-so="living-start-note">{note}</div>}
        </div>
      )}
    </div>
  );
};

export default LivingStart;
