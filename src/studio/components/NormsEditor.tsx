import React from "react";
import type { StoryNorm } from "@engine/index";
import HelpTooltip from "@components/studio/HelpTooltip";
import { useDraftStore } from "../draft";
import { removeNorm, setNorm } from "../gameMutations";
import { nextId } from "../mutations";
import { narratesPlayer } from "../cueDiagnostics";
import GateBuilder from "./GateBuilder";
import { TextField } from "./GameFields";

const HELP = "A social rule the cast holds. When an event breaks it, each witness you list who is not away gets one cue to react, for three turns. "
  + "A norm never keeps a score: gate on cue_norm_<id>_at for consequences.";

const NormRow: React.FC<{ norm: StoryNorm }> = ({ norm }) => {
  const mutate = useDraftStore((state) => state.mutate);
  const draft = useDraftStore((state) => state.draft);
  const patch = (value: Partial<StoryNorm>) => mutate((current) => setNorm(current, { ...norm, ...value }));
  const toggle = (id: string, on: boolean) => patch({ noticed_by: on ? [...new Set([...norm.noticed_by, id])] : norm.noticed_by.filter((entry) => entry !== id) });
  return (
    <div data-so="norm-row" className="st-subpanel flex flex-col gap-2 p-2">
      <div className="flex flex-wrap items-end gap-2">
        <span className="st-pill px-2 py-0.5 text-[11px]">{norm.id}</span>
        <TextField label={`norm ${norm.id} label`} value={norm.label} onChange={(label) => patch({ label })} placeholder="guests do not draw steel at the table" />
        <button type="button" className="st-button danger" aria-label={`Remove norm ${norm.id}`} onClick={() => mutate((current) => removeNorm(current, norm.id))}>×</button>
      </div>
      <TextField label={`norm ${norm.id} cue`} value={norm.cue} onChange={(cue) => patch({ cue })} placeholder="a guest drew steel at the host's table" />
      {narratesPlayer(norm.cue) && <div data-so="cue-warning" role="note" className="text-xs st-warn">Says what the player does or feels. Name what the witnesses saw.</div>}
      <span className="text-xs st-muted">Broken when (an event)</span>
      <GateBuilder gate={norm.broken_when} qualities={draft.qualities} onChange={(broken_when) => patch({ broken_when })} />
      <div className="flex flex-wrap gap-2 text-sm">
        <span className="text-xs st-muted">Noticed by</span>
        {draft.roster.map((member) => (
          <label key={member.id} className="flex items-center gap-1">
            <input type="checkbox" aria-label={`norm ${norm.id} noticed by ${member.id}`} checked={norm.noticed_by.includes(member.id)}
              onChange={(event) => toggle(member.id, event.target.checked)} />
            {member.name ?? member.id}
          </label>
        ))}
      </div>
    </div>
  );
};

const NormsEditor: React.FC = () => {
  const norms = useDraftStore((state) => state.draft.norms) ?? [];
  const mutate = useDraftStore((state) => state.mutate);
  const add = () => mutate((current) => setNorm(current, {
    id: nextId((current.norms ?? []).map((norm) => norm.id), "norm"), label: "", broken_when: { all: [] }, noticed_by: current.roster.slice(0, 1).map((member) => member.id), cue: "",
  }));
  return (
    <div id="so-norms-editor" data-so="norms-editor" className="st-subpanel flex flex-col gap-3 p-3">
      <div className="text-sm font-medium">Social norms<HelpTooltip title={HELP} /></div>
      {norms.map((norm) => <NormRow key={norm.id} norm={norm} />)}
      <button type="button" className="st-button secondary self-start" onClick={add}>+ Norm</button>
    </div>
  );
};

export default NormsEditor;
