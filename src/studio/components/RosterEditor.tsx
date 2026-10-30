import React, { useState } from "react";
import type { RosterMember } from "@engine/index";
import { Button } from "@components/ui/Button";
import { useDraftStore } from "../draft";
import { addRosterMember, nextId, removeRosterMember, setMemberCard, updateRosterMember } from "../mutations";
import { setRosterDrive, setRosterView } from "../innerVoiceMutations";
import type { StudioPage } from "../studioNav";
import CardFieldsEditor from "./CardFieldsEditor";
import FactionsEditor from "./FactionsEditor";
import RelationshipLabelsEditor from "./RelationshipLabelsEditor";
import CommitmentsEditor from "./CommitmentsEditor";
import CuesEditor from "./CuesEditor";
import VoiceDeliveryEditor from "./VoiceDeliveryEditor";

const splitAliases = (text: string) => text.split(",").map((alias) => alias.trim()).filter(Boolean);

const Described: React.FC<{ label: string; description?: string; children: React.ReactNode; wide?: boolean }> = ({ label, description, children, wide = true }) => (
  <label className={`flex ${wide ? "basis-full" : "flex-1"} flex-col gap-1 text-sm`}>
    <span className="text-xs font-semibold">{label}</span>
    {description && <span className="text-xs st-muted">{description}</span>}
    {children}
  </label>
);

const AliasesField = ({ index, aliases, onCommit }: { index: number; aliases: string[]; onCommit: (aliases: string[]) => void }) => {
  const [text, setText] = useState(aliases.join(", "));
  return (
    <Described label="Also called" description="Other names the story uses, comma separated. Speaker direction accepts them; a name two characters share picks neither.">
      <input
        className="text_pole st-input"
        aria-label={`Member ${index + 1} aliases`}
        data-so="roster-aliases"
        placeholder="optional — e.g. the Guildmaster, Val"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => onCommit(splitAliases(text))}
      />
    </Described>
  );
};

const MemberIdentity = ({ member, index }: { member: RosterMember; index: number }) => {
  const mutate = useDraftStore((state) => state.mutate);
  const qualities = useDraftStore((state) => state.draft.qualities);
  const roster = useDraftStore((state) => state.draft.roster);
  const player = useDraftStore((state) => state.draft.player);
  return (
    <section data-so="character-identity" className="st-subpanel flex flex-wrap items-end gap-2 p-2" aria-label="Identity">
      <Described label="Id" description="How effects and gates refer to this member." wide={false}>
        <input className="text_pole st-input" aria-label={`Member ${index + 1} id`} value={member.id}
          onChange={(event) => mutate((current) => updateRosterMember(current, member.id, { id: event.target.value.trim() }))} />
      </Described>
      <Described label="Character name" description="Must match the card in the group." wide={false}>
        <input className="text_pole st-input" aria-label={`Member ${index + 1} name`} list="so-roster-names" placeholder="as it appears in the group" value={member.name ?? ""}
          onChange={(event) => mutate((current) => updateRosterMember(current, member.id, { name: event.target.value || undefined }))} />
      </Described>
      <Described label="Role" description="One line on what they do in the story. The judgment model's speaker direction needs it on every candidate.">
        <input className="text_pole st-input" aria-label={`Member ${index + 1} role`} maxLength={160} placeholder="optional — what they do in this story" value={member.role ?? ""}
          onChange={(event) => mutate((current) => updateRosterMember(current, member.id, { role: event.target.value || undefined }))} />
      </Described>
      <AliasesField key={`${member.id}:${(member.aliases ?? []).join("|")}`} index={index} aliases={member.aliases ?? []}
        onCommit={(aliases) => mutate((current) => updateRosterMember(current, member.id, { aliases: aliases.length ? aliases : undefined }))} />
      <Described label="Drive" description="What they want across the whole story. Only this character is told it, privately.">
        <input className="text_pole st-input" aria-label={`Member ${index + 1} drive`} maxLength={200} placeholder="optional — their standing goal" value={member.drive ?? ""}
          onChange={(event) => mutate((current) => setRosterDrive(current, member.id, event.target.value))} />
      </Described>
      <label className="flex basis-full items-center gap-2 text-sm">
        <input type="checkbox" aria-label={`Member ${index + 1} narrator view`} checked={member.view === "omniscient"}
          onChange={(event) => mutate((current) => setRosterView(current, member.id, event.target.checked ? "omniscient" : "own"))} />
        <span>Narrator view <span className="text-xs st-muted">— told every character's private aims and secrets, to foreshadow, never to reveal them</span></span>
      </label>
      <CardFieldsEditor card={member.card} qualities={qualities} roster={roster} player={player}
        onChange={(card) => mutate((current) => setMemberCard(current, member.id, card))} />
    </section>
  );
};

const MotiveLinks = ({ member, onNavigate }: { member: RosterMember; onNavigate?: (page: StudioPage) => void }) => {
  const checkpoints = useDraftStore((state) => state.draft.checkpoints);
  const selectCheckpoint = useDraftStore((state) => state.selectCheckpoint);
  const rows = checkpoints.filter((checkpoint) => checkpoint.motives?.[member.id]?.trim());
  return (
    <section data-so="character-motives" className="st-subpanel flex flex-col gap-1 p-2" aria-label="Motives by checkpoint">
      <span className="text-sm font-semibold">Motives by checkpoint</span>
      {rows.length === 0 ? <span className="text-xs st-muted">No checkpoint gives this character a motive yet. Add one in a checkpoint's Cast section.</span> : (
        <ul className="flex flex-col gap-1">
          {rows.map((checkpoint) => (
            <li key={checkpoint.id} className="flex flex-wrap items-baseline gap-2 text-sm">
              <Button size="sm" variant="ghost" icon="fa-arrow-right" data-so="motive-link"
                onClick={() => { selectCheckpoint(checkpoint.id); onNavigate?.({ tab: "checkpoints" }); }}>{checkpoint.name || checkpoint.id}</Button>
              <span>{checkpoint.motives?.[member.id]}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

const CharacterPage = ({ member, index, onNavigate }: { member: RosterMember; index: number; onNavigate?: (page: StudioPage) => void }) => {
  const mutate = useDraftStore((state) => state.mutate);
  return (
    <div data-so="character-page" data-member={member.id} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="m-0 flex-1 text-base font-semibold">{member.name || member.id}</h3>
        <Button size="sm" variant="ghost" icon="fa-image" onClick={() => onNavigate?.({ tab: "sprites" })}>Sprites</Button>
        <Button size="sm" variant="danger" icon="fa-trash" aria-label={`Remove member ${index + 1}`}
          onClick={() => { mutate((current) => removeRosterMember(current, member.id)); onNavigate?.({ tab: "roster" }); }}>Remove</Button>
      </div>
      <MemberIdentity member={member} index={index} />
      <VoiceDeliveryEditor memberId={member.id} />
      <RelationshipLabelsEditor memberId={member.id} />
      <CommitmentsEditor memberId={member.id} />
      <CuesEditor memberId={member.id} />
      <MotiveLinks member={member} onNavigate={onNavigate} />
    </div>
  );
};

const CastOverview = ({ onNavigate }: { onNavigate?: (page: StudioPage) => void }) => {
  const roster = useDraftStore((state) => state.draft.roster);
  const qualities = useDraftStore((state) => state.draft.qualities);
  const player = useDraftStore((state) => state.draft.player);
  const directed = useDraftStore((state) => state.draft.checkpoints.some((checkpoint) => Boolean(checkpoint.talk_control)));
  const mutate = useDraftStore((state) => state.mutate);
  const withoutRole = roster.filter((member) => !member.role?.trim()).map((member) => member.name || member.id);
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" icon="fa-plus"
          onClick={() => mutate((current) => addRosterMember(current, { id: nextId(current.roster.map((member) => member.id), "member") }))}>Member</Button>
        <span className="text-xs st-muted">The cast this story directs. Open a character for their voice, labels, promises, cues and motives.</span>
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
            <li key={index} data-so="roster-member" data-member={member.id} className="st-subpanel flex flex-wrap items-end gap-2 p-2">
              <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-sm">
                <span className="text-xs st-muted">Character name</span>
                <input className="text_pole st-input" aria-label={`Member ${index + 1} name`} list="so-roster-names" placeholder="as it appears in the group" value={member.name ?? ""}
                  onChange={(event) => mutate((current) => updateRosterMember(current, member.id, { name: event.target.value || undefined }))} />
              </label>
              <span className="min-w-0 flex-1 text-xs st-muted">{member.role || "no role yet"}</span>
              <Button size="sm" icon="fa-arrow-right" data-so="roster-open" onClick={() => onNavigate?.({ tab: "roster", member: member.id })}>Open</Button>
            </li>
          ))}
        </ul>
      )}
      <FactionsEditor />
      <div data-so="player-card" className="st-subpanel flex flex-col gap-2 p-2">
        <span className="text-sm font-semibold">Player card</span>
        <span className="text-xs st-muted">Binds a quality to the player's own card, so their look or state can change as the story moves.
          Only an extracted string or enum that does not latch can bind.</span>
        <CardFieldsEditor card={player?.card} qualities={qualities} roster={roster} player={player}
          onChange={(card) => mutate((current) => setMemberCard(current, "player", card))} />
      </div>
    </>
  );
};

const RosterEditor: React.FC<{ memberNames?: string[]; memberId?: string; onNavigate?: (page: StudioPage) => void }> = ({ memberNames = [], memberId, onNavigate }) => {
  const roster = useDraftStore((state) => state.draft.roster);
  const index = memberId ? roster.findIndex((member) => member.id === memberId) : -1;
  return (
    <div data-so="roster" className="flex flex-col gap-3">
      {index >= 0 ? <CharacterPage member={roster[index]} index={index} onNavigate={onNavigate} /> : <CastOverview onNavigate={onNavigate} />}
      <datalist id="so-roster-names">
        {memberNames.map((name) => <option key={name} value={name} />)}
      </datalist>
    </div>
  );
};

export default RosterEditor;
