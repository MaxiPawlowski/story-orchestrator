import React, { useState } from "react";
import HelpTooltip from "@components/studio/HelpTooltip";
import { useDraftStore } from "../draft";
import { addRosterMember, nextId, removeRosterMember, setMemberCard, updateRosterMember } from "../mutations";
import { setRosterDrive, setRosterView } from "../innerVoiceMutations";
import CardFieldsEditor from "./CardFieldsEditor";

const splitAliases = (text: string) => text.split(",").map((alias) => alias.trim()).filter(Boolean);

const AliasesField = ({ index, aliases, onCommit }: { index: number; aliases: string[]; onCommit: (aliases: string[]) => void }) => {
  const [text, setText] = useState(aliases.join(", "));
  return (
    <label className="flex basis-full flex-col gap-1 text-sm">
      <span className="text-xs st-muted">Also called <HelpTooltip title={"Other names the story uses for this character, comma separated: a surname, a title, a nickname " +
        "('Dalan Evergreen, little brother'). Speaker direction shows them beside the name and accepts them as an answer. A name two " +
        "characters share is never used to pick either."} /></span>
      <input
        className="text_pole st-input"
        aria-label={`Member ${index + 1} aliases`}
        data-so="roster-aliases"
        placeholder="optional — e.g. the Guildmaster, Val"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => onCommit(splitAliases(text))}
      />
    </label>
  );
};

// The roster is what every cast-facing picker offers: talk_control speakers and lead, npc_replies
// members, cast_changes. Studio-born stories used to render those pickers empty (finding).
const RosterEditor: React.FC<{ memberNames?: string[] }> = ({ memberNames = [] }) => {
  const roster = useDraftStore((state) => state.draft.roster);
  const qualities = useDraftStore((state) => state.draft.qualities);
  const player = useDraftStore((state) => state.draft.player);
  const directed = useDraftStore((state) => state.draft.checkpoints.some((checkpoint) => Boolean(checkpoint.talk_control)));
  const mutate = useDraftStore((state) => state.mutate);
  const withoutRole = roster.filter((member) => !member.role?.trim()).map((member) => member.name || member.id);

  return (
    <div data-so="roster" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="st-button primary"
          onClick={() => mutate((current) => addRosterMember(current, { id: nextId(current.roster.map((member) => member.id), "member") }))}
        >+ Member</button>
        <span className="text-xs st-muted">Roster <HelpTooltip title={"The cast this story directs. The id is how effects and gates refer to a member; the name must match the " +
          "character card in the group so speaker direction can resolve it."} /></span>
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
                <span className="text-xs st-muted">Role <HelpTooltip title={"One line on what this character does in the story, e.g. 'the guild quartermaster who pays for the " +
                  "relic'. The judgment model's speaker direction uses it, and only runs when every candidate has one."} /></span>
                <input
                  className="text_pole st-input"
                  aria-label={`Member ${index + 1} role`}
                  maxLength={160}
                  placeholder="optional — what they do in this story"
                  value={member.role ?? ""}
                  onChange={(event) => mutate((current) => updateRosterMember(current, member.id, { role: event.target.value || undefined }))}
                />
              </label>
              <AliasesField
                key={`${member.id}:${(member.aliases ?? []).join("|")}`}
                index={index}
                aliases={member.aliases ?? []}
                onCommit={(aliases) => mutate((current) => updateRosterMember(current, member.id, { aliases: aliases.length ? aliases : undefined }))}
              />
              <label className="flex basis-full flex-col gap-1 text-sm">
                <span className="text-xs st-muted">Drive <HelpTooltip title={"What this character wants across the whole story, e.g. 'clear his brother's name'. Only this " +
                  "character is told it, privately, before they speak."} /></span>
                <input
                  className="text_pole st-input"
                  aria-label={`Member ${index + 1} drive`}
                  maxLength={200}
                  placeholder="optional — their standing goal"
                  value={member.drive ?? ""}
                  onChange={(event) => mutate((current) => setRosterDrive(current, member.id, event.target.value))}
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  aria-label={`Member ${index + 1} narrator view`}
                  checked={member.view === "omniscient"}
                  onChange={(event) => mutate((current) => setRosterView(current, member.id, event.target.checked ? "omniscient" : "own"))}
                />
                <span className="text-xs st-muted">Narrator view <HelpTooltip title={"A narrator is told every character's private aims and secrets, to foreshadow. It is told " +
                  "never to reveal what a character conceals."} /></span>
              </label>
              <CardFieldsEditor card={member.card} qualities={qualities} roster={roster} player={player}
                onChange={(card) => mutate((current) => setMemberCard(current, member.id, card))} />
              <button type="button" className="st-button danger" aria-label={`Remove member ${index + 1}`} onClick={() => mutate((current) => removeRosterMember(current, member.id))}>×</button>
            </li>
          ))}
        </ul>
      )}
      <div data-so="player-card" className="st-subpanel flex flex-col gap-2 p-2">
        <span className="text-xs st-muted">Player card <HelpTooltip title={"Binds a quality to the player's own card, so their look or state can change as the story " +
          "moves. Only an extracted string or enum that does not latch can bind."} /></span>
        <CardFieldsEditor card={player?.card} qualities={qualities} roster={roster} player={player}
          onChange={(card) => mutate((current) => setMemberCard(current, "player", card))} />
      </div>
      <datalist id="so-roster-names">
        {memberNames.map((name) => <option key={name} value={name} />)}
      </datalist>
    </div>
  );
};

export default RosterEditor;
