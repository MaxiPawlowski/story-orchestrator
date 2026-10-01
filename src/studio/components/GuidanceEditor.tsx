import React, { useState } from "react";
import { buildGuidance, guidanceMembers, guidanceShared, type Checkpoint, type RosterMember } from "@engine/index";

export interface GuidanceEditorProps {
  guidance: Checkpoint["guidance"];
  roster: RosterMember[];
  onChange(next: Checkpoint["guidance"]): void;
}

export function GuidanceEditor({ guidance, roster, onChange }: GuidanceEditorProps) {
  const shared = guidanceShared(guidance);
  const members = guidanceMembers(guidance);
  const [open, setOpen] = useState(() => Object.keys(members).length > 0);
  const known = new Set(roster.map((member) => member.id));
  const unknown = Object.keys(members).filter((id) => !known.has(id));
  const setMember = (id: string, text: string) => onChange(buildGuidance(shared, { ...members, [id]: text }));
  return (
    <div data-so="guidance-editor" className="flex flex-col gap-2">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs st-muted">Guidance (everyone hears this)</span>
        <textarea data-so="guidance-shared" className="text_pole st-input min-h-[3rem]" value={shared} onChange={(event) => onChange(buildGuidance(event.target.value, members))} />
      </label>
      {roster.length > 0 && (
        <details data-so="guidance-members" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
          <summary className="text-xs st-muted">Private direction per member (only that member hears it; secrets belong here or in epistemic rows)</summary>
          <div className="flex flex-col gap-2 pt-2">
            {roster.map((member) => (
              <label key={member.id} className="flex flex-col gap-1 text-sm">
                <span className="text-xs st-muted">Only {member.name ?? member.id} hears</span>
                <textarea data-so="guidance-member" data-member={member.id} className="text_pole st-input min-h-[2.5rem]" value={members[member.id] ?? ""}
                  onChange={(event) => setMember(member.id, event.target.value)} />
              </label>
            ))}
            {unknown.map((id) => (
              <div key={id} data-so="guidance-member-unknown" className="text-xs st-muted">
                &quot;{id}&quot; is not in the roster, so nobody hears its direction.
                <button type="button" className="menu_button" onClick={() => setMember(id, "")}>Remove</button>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

export default GuidanceEditor;
