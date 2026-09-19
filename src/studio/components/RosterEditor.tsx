import React from "react";
import HelpTooltip from "@components/studio/HelpTooltip";
import { useDraftStore } from "../draft";
import { addRosterMember, nextId, removeRosterMember, updateRosterMember } from "../mutations";

// The roster is what every cast-facing picker offers: talk_control speakers and lead, npc_replies
// members, cast_changes. Studio-born stories used to render those pickers empty (finding U7).
const RosterEditor: React.FC<{ memberNames?: string[] }> = ({ memberNames = [] }) => {
  const roster = useDraftStore((state) => state.draft.roster);
  const directed = useDraftStore((state) => state.draft.checkpoints.some((checkpoint) => Boolean(checkpoint.talk_control)));
  const mutate = useDraftStore((state) => state.mutate);
  const withoutRole = roster.filter((member) => !member.role?.trim()).map((member) => member.name || member.id);

  return (
    <div data-so="roster" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="st-button primary" onClick={() => mutate((current) => addRosterMember(current, { id: nextId(current.roster.map((member) => member.id), "member") }))}>+ Member</button>
        <span className="text-xs st-muted">Roster <HelpTooltip title="The cast this story directs. The id is how effects and gates refer to a member; the name must match the character card in the group so speaker direction can resolve it." /></span>
      </div>
      {directed && roster.length > 0 && withoutRole.length > 0 && (
        <div data-so="roster-roles-hint" className="text-xs st-muted">
          Judgment-model speaker direction only runs when every character in the pool has a role. Missing: {withoutRole.join(", ")}. Without roles, the usual director decides.
        </div>
      )}
      {roster.length === 0 ? (
        <div className="st-subpanel p-4 text-sm st-muted">No cast yet. Add the characters this story directs — speaker direction, npc replies and cast changes all pick from here.</div>
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Roster members">
          {roster.map((member, index) => (
            <li key={index} className="st-subpanel flex flex-wrap items-end gap-2 p-2">
              <label className="flex flex-1 flex-col gap-1 text-sm">
                <span className="text-xs st-muted">Id</span>
                <input
                  className="text_pole st-input"
                  aria-label={`Member ${index + 1} id`}
                  value={member.id}
                  onChange={(event) => mutate((current) => updateRosterMember(current, member.id, { id: event.target.value.trim() }))}
                />
              </label>
              <label className="flex flex-1 flex-col gap-1 text-sm">
                <span className="text-xs st-muted">Character name</span>
                <input
                  className="text_pole st-input"
                  aria-label={`Member ${index + 1} name`}
                  list="so-roster-names"
                  placeholder="as it appears in the group"
                  value={member.name ?? ""}
                  onChange={(event) => mutate((current) => updateRosterMember(current, member.id, { name: event.target.value || undefined }))}
                />
              </label>
              <label className="flex basis-full flex-col gap-1 text-sm">
                <span className="text-xs st-muted">Role <HelpTooltip title="One line on what this character does in the story, e.g. 'the guild quartermaster who pays for the relic'. The judgment model's speaker direction uses it, and only runs when every candidate has one." /></span>
                <input
                  className="text_pole st-input"
                  aria-label={`Member ${index + 1} role`}
                  maxLength={160}
                  placeholder="optional — what they do in this story"
                  value={member.role ?? ""}
                  onChange={(event) => mutate((current) => updateRosterMember(current, member.id, { role: event.target.value || undefined }))}
                />
              </label>
              <button type="button" className="st-button danger" aria-label={`Remove member ${index + 1}`} onClick={() => mutate((current) => removeRosterMember(current, member.id))}>×</button>
            </li>
          ))}
        </ul>
      )}
      <datalist id="so-roster-names">
        {memberNames.map((name) => <option key={name} value={name} />)}
      </datalist>
    </div>
  );
};

export default RosterEditor;
