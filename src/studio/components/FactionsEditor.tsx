import React from "react";
import type { DisplayBand, Faction, FactionMove } from "@engine/index";
import HelpTooltip from "@components/studio/HelpTooltip";
import { useDraftStore } from "../draft";
import { addFaction, removeFaction, setMemberFactions, updateFaction } from "../gameMutations";
import GateBuilder from "./GateBuilder";
import { JsonField, OptionalGate, TextField } from "./GameFields";
import { Button } from "@components/ui/Button";
import { IconButton } from "@components/ui/IconButton";

const HELP = "A faction is a group whose standing with the player moves only on the moves you write here and on quest rewards. Players see the band word, never the number. "
  + "A move fires once ever, the first turn its gate holds; one that lowers standing must gate on something the player did.";
const BANDS_HINT = '[{"max": -2, "label": "Hostile"}, {"max": 1, "label": "Neutral"}, {"label": "Trusted"}]';

const toInt = (text: string, fallback: number) => (Number.isInteger(Number(text)) && text.trim() ? Number(text) : fallback);

const MoveRow = ({ faction, move, at }: { faction: Faction; move: FactionMove; at: number }) => {
  const mutate = useDraftStore((state) => state.mutate);
  const qualities = useDraftStore((state) => state.draft.qualities);
  const patch = (value: Partial<FactionMove>) => mutate((current) => updateFaction(current, faction.id, {
    moves: faction.moves.map((entry, index) => (index === at ? { ...entry, ...value } : entry)),
  }));
  return (
    <div data-so="faction-move-row" className="st-subpanel flex flex-col gap-2 p-2">
      <div className="flex flex-wrap items-end gap-2">
        <TextField label={`${faction.id} move ${at + 1} id`} value={move.id} onChange={(id) => patch({ id: id.trim() })} />
        <TextField label={`${faction.id} move ${at + 1} add`} value={String(move.add)} onChange={(add) => patch({ add: toInt(add, move.add) })} />
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs st-muted">Heard by</span>
          <select className="text_pole st-input" aria-label={`${faction.id} move ${at + 1} heard by`} value={move.heard_by}
            onChange={(event) => patch({ heard_by: event.target.value === "faction" ? "faction" : "present" })}>
            <option value="present">Members present</option>
            <option value="faction">The whole faction</option>
          </select>
        </label>
        <IconButton icon="fa-xmark" label={`Remove ${faction.id} move ${at + 1}`}
          onClick={() => mutate((current) => updateFaction(current, faction.id, { moves: faction.moves.filter((_, index) => index !== at) }))} />
      </div>
      <GateBuilder gate={move.when} qualities={qualities} onChange={(when) => patch({ when })} />
    </div>
  );
};

const FactionRow = ({ faction }: { faction: Faction }) => {
  const mutate = useDraftStore((state) => state.mutate);
  const qualities = useDraftStore((state) => state.draft.qualities);
  const roster = useDraftStore((state) => state.draft.roster);
  const patch = (value: Partial<Omit<Faction, "id">>) => mutate((current) => updateFaction(current, faction.id, value));
  const addMove = () => patch({ moves: [...faction.moves, { id: `move-${faction.moves.length + 1}`, when: { all: [] }, add: 1, heard_by: "present" }] });
  return (
    <div data-so="faction-editor-row" data-faction={faction.id} className="st-subpanel flex flex-col gap-2 p-2">
      <div className="flex flex-wrap items-end gap-2">
        <span className="st-pill px-2 py-0.5 text-[11px]">{faction.id}</span>
        <TextField label={`${faction.id} name`} value={faction.name} onChange={(name) => patch({ name })} />
        <TextField label={`${faction.id} lowest`} value={String(faction.range[0])} onChange={(low) => patch({ range: [toInt(low, faction.range[0]), faction.range[1]] })} />
        <TextField label={`${faction.id} highest`} value={String(faction.range[1])} onChange={(high) => patch({ range: [faction.range[0], toInt(high, faction.range[1])] })} />
        <TextField label={`${faction.id} start`} value={String(faction.start)} onChange={(start) => patch({ start: toInt(start, faction.start) })} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" aria-label={`${faction.id} introduce`} checked={faction.introduce === true}
            onChange={(event) => patch({ introduce: event.target.checked ? true : undefined })} />
          The director may introduce it
        </label>
        <IconButton icon="fa-xmark" label={`Remove faction ${faction.id}`} onClick={() => mutate((current) => removeFaction(current, faction.id))} />
      </div>
      <JsonField label={`${faction.id} bands`} hint={BANDS_HINT} value={faction.bands}
        onChange={(bands) => { if (Array.isArray(bands)) patch({ bands: bands as DisplayBand[] }); }} />
      <OptionalGate label={`${faction.id} shown only when`} gate={faction.visible_when} qualities={qualities} onChange={(visible_when) => patch({ visible_when })} />
      <fieldset className="flex flex-wrap gap-2 text-sm" aria-label={`${faction.id} members`}>
        <span className="text-xs st-muted">Members</span>
        {roster.map((member) => (
          <label key={member.id} className="flex items-center gap-1">
            <input type="checkbox" aria-label={`${member.id} belongs to ${faction.id}`} checked={member.factions?.includes(faction.id) === true}
              onChange={(event) => mutate((current) => setMemberFactions(current, member.id,
                event.target.checked ? [...(member.factions ?? []), faction.id] : (member.factions ?? []).filter((id) => id !== faction.id)))} />
            {member.name || member.id}
          </label>
        ))}
      </fieldset>
      {faction.moves.map((move, at) => <MoveRow key={at} faction={faction} move={move} at={at} />)}
      <Button className="self-start" onClick={addMove}>+ Move</Button>
    </div>
  );
};

const FactionsEditor: React.FC = () => {
  const factions = useDraftStore((state) => state.draft.factions) ?? [];
  const mutate = useDraftStore((state) => state.mutate);
  return (
    <div data-so="factions-editor" className="st-subpanel flex flex-col gap-2 p-3">
      <div className="text-sm font-medium">Factions<HelpTooltip title={HELP} /></div>
      {factions.map((faction) => <FactionRow key={faction.id} faction={faction} />)}
      <Button className="self-start" onClick={() => mutate((current) => addFaction(current))}>+ Faction</Button>
    </div>
  );
};

export default FactionsEditor;
