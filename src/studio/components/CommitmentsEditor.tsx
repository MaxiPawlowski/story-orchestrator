import React from "react";
import { COMMITMENT_START, COMMITMENT_TO_PLAYER, type Commitment, type CommitmentDue, type RosterMember } from "@engine/index";
import HelpTooltip from "@components/studio/HelpTooltip";
import { useDraftStore } from "../draft";
import { setCommitments } from "../gameMutations";
import { nextId } from "../mutations";
import GateBuilder from "./GateBuilder";
import { JsonField, OptionalGate, TextField } from "./GameFields";

const HELP = "Something a character has promised the player. It is made, then kept or broken by an event, never by time. The character is reminded of it in its own notes; "
  + "the player sees \"Promised you: ...\" on the character's People page once made, unless it was said out of the player's hearing.";

type DueKind = "none" | "boundaries" | "story_day";

const dueKind = (due: CommitmentDue | undefined): DueKind => (!due ? "none" : "boundaries" in due ? "boundaries" : "story_day");

const dueOf = (kind: DueKind, count: number): CommitmentDue | undefined => (kind === "none" ? undefined : kind === "boundaries" ? { boundaries: count } : { story_day: count });

const CommitmentRow = ({ member, commitment, list }: { member: RosterMember; commitment: Commitment; list: Commitment[] }) => {
  const mutate = useDraftStore((state) => state.mutate);
  const qualities = useDraftStore((state) => state.draft.qualities);
  const name = `${member.id} promise ${commitment.id}`;
  const patch = (value: Partial<Commitment>) => mutate((current) => setCommitments(current, member.id, list.map((item) => {
    if (item.id !== commitment.id) return item;
    const next: Commitment = { ...item, ...value };
    (Object.keys(value) as Array<keyof Commitment>).forEach((key) => { if (value[key] === undefined) delete next[key]; });
    return next;
  })));
  const kind = dueKind(commitment.due);
  const count = commitment.due ? ("boundaries" in commitment.due ? commitment.due.boundaries : commitment.due.story_day) : 12;
  return (
    <div data-so="commitment-row" data-member={member.id} className="st-subpanel flex flex-col gap-2 p-2">
      <div className="flex flex-wrap items-end gap-2">
        <span className="st-pill px-2 py-0.5 text-[11px]">{commitment.id}</span>
        <TextField label={`${name} what`} value={commitment.what} onChange={(what) => patch({ what })} placeholder="repay the debt from the river" />
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" aria-label={`${name} heard by the player`} checked={commitment.heard !== false}
            onChange={(event) => patch({ heard: event.target.checked ? undefined : false })} />
          Said in the player's hearing
        </label>
        <button type="button" className="st-button danger" aria-label={`Remove ${name}`}
          onClick={() => mutate((current) => setCommitments(current, member.id, list.filter((item) => item.id !== commitment.id)))}>×</button>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" aria-label={`${name} made before the story`} checked={commitment.made_when === COMMITMENT_START}
          onChange={(event) => patch({ made_when: event.target.checked ? COMMITMENT_START : { all: [] } })} />
        Made before the story starts
      </label>
      {commitment.made_when !== COMMITMENT_START && (
        <>
          <span className="text-xs st-muted">Made when</span>
          <GateBuilder gate={commitment.made_when} qualities={qualities} onChange={(made_when) => patch({ made_when })} />
        </>
      )}
      <span className="text-xs st-muted">Kept when</span>
      <GateBuilder gate={commitment.kept_when} qualities={qualities} onChange={(kept_when) => patch({ kept_when })} />
      <OptionalGate label={`${name} broken when (an event, never time)`} gate={commitment.broken_when} qualities={qualities} onChange={(broken_when) => patch({ broken_when })} />
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs st-muted">Due</span>
          <select aria-label={`${name} due`} value={kind} onChange={(event) => patch({ due: dueOf(event.target.value as DueKind, count) })}>
            <option value="none">No date (overdue after 12 turns)</option>
            <option value="boundaries">After a number of turns</option>
            <option value="story_day">By a story day</option>
          </select>
        </label>
        {kind !== "none" && (
          <input type="number" min={1} className="text_pole st-input w-20" aria-label={`${name} due count`} value={count}
            onChange={(event) => { const next = Number(event.target.value); if (Number.isInteger(next) && next >= 1) patch({ due: dueOf(kind, next) }); }} />
        )}
      </div>
      <JsonField label={`${name} effect when kept`} value={commitment.effect} onChange={(effect) => patch({ effect: effect as Commitment["effect"] })}
        hint="{world_info?, npc_replies?: [{trigger: &quot;onEnter&quot;, ...}]}" />
    </div>
  );
};

const CommitmentsEditor: React.FC<{ memberId?: string }> = ({ memberId }) => {
  const cast = useDraftStore((state) => state.draft.roster);
  const roster = memberId ? cast.filter((member) => member.id === memberId) : cast;
  const mutate = useDraftStore((state) => state.mutate);
  if (!roster.length) return null;
  const add = (member: RosterMember) => {
    const list = member.commitments ?? [];
    const created: Commitment = { id: nextId(list.map((item) => item.id), "promise"), to: COMMITMENT_TO_PLAYER, what: "", made_when: { all: [] }, kept_when: { all: [] } };
    mutate((current) => setCommitments(current, member.id, [...list, created]));
  };
  return (
    <div data-so="commitments-editor" className="st-subpanel flex flex-col gap-2 p-3">
      <div className="text-sm font-medium">Promises to the player<HelpTooltip title={HELP} /></div>
      {roster.map((member) => (
        <div key={member.id} className="flex flex-col gap-2">
          {(member.commitments ?? []).map((commitment) => <CommitmentRow key={commitment.id} member={member} commitment={commitment} list={member.commitments ?? []} />)}
          <button type="button" className="st-button secondary self-start" onClick={() => add(member)}>+ Promise from {member.name ?? member.id}</button>
        </div>
      ))}
    </div>
  );
};

export default CommitmentsEditor;
