import React from "react";
import { isReached, type Observation, type ObservationPassive, type ObservationWhen, type Quality } from "@engine/index";
import HelpTooltip from "@components/studio/HelpTooltip";
import { useDraftStore } from "../draft";
import { removeObservation, setObservationsShown, updateObservation } from "../gameMutations";
import { nextId } from "../mutations";
import { imposesMind, instructs } from "../observationDiagnostics";
import GateBuilder from "./GateBuilder";
import { TextField, optionalText } from "./GameFields";

const HELP = "Small details the player can notice: what is there to see, never what they feel or should do. A line shows on the story card the turn it is noticed and stays in the "
  + "Journal; a passive roll decides, unseen, whether it is noticed at all. No model is told.";

interface WhenProps {
  label: string;
  when: ObservationWhen;
  qualities: Quality[];
  checkpoints: string[];
  onChange: (when: ObservationWhen) => void;
}

const WhenField: React.FC<WhenProps> = ({ label, when, qualities, checkpoints, onChange }) => (
  <div className="flex flex-col gap-1">
    <label className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-xs st-muted">{label}</span>
      <select aria-label={label} value={isReached(when) ? "reached" : "gate"} onChange={(event) => onChange(event.target.value === "reached" ? { reached: checkpoints[0] ?? "" } : { all: [] })}>
        <option value="reached">When a checkpoint is reached</option>
        <option value="gate">When a condition holds</option>
      </select>
      {isReached(when) && (
        <select aria-label={`${label} checkpoint`} value={when.reached} onChange={(event) => onChange({ reached: event.target.value })}>
          {checkpoints.map((id) => <option key={id} value={id}>{id}</option>)}
        </select>
      )}
    </label>
    {!isReached(when) && <GateBuilder gate={when} qualities={qualities} onChange={onChange} />}
  </div>
);

const whole = (value: string, floor: number): number | null => {
  const number = Number(value);
  return Number.isInteger(number) && number >= floor ? number : null;
};

const PassiveField: React.FC<{ label: string; passive: ObservationPassive | undefined; onChange: (passive: ObservationPassive | undefined) => void }> = ({ label, passive, onChange }) => (
  <div className="flex flex-wrap items-end gap-2 text-sm">
    <label className="flex items-center gap-2">
      <input type="checkbox" aria-label={`${label} passive roll`} checked={Boolean(passive)}
        onChange={(event) => onChange(event.target.checked ? { roll: { sides: 20, target: 10 } } : undefined)} />
      Passive roll (never shown)
    </label>
    {passive && (["sides", "target", "dice"] as const).map((field) => (
      <label key={field} className="flex flex-col gap-1">
        <span className="text-xs st-muted">{field === "sides" ? "Sides" : field === "target" ? "Notices at" : "Dice"}</span>
        <input type="number" min={field === "sides" ? 2 : 1} className="text_pole st-input w-16" aria-label={`${label} ${field}`} value={passive.roll[field] ?? 1}
          onChange={(event) => {
            const value = whole(event.target.value, field === "sides" ? 2 : 1);
            if (value === null) return;
            const roll = { ...passive.roll, [field]: value };
            if (field === "dice" && value === 1) delete roll.dice;
            onChange({ ...passive, roll });
          }} />
      </label>
    ))}
  </div>
);

const ObservationRow: React.FC<{ observation: Observation; sources: string[] }> = ({ observation, sources }) => {
  const mutate = useDraftStore((state) => state.mutate);
  const qualities = useDraftStore((state) => state.draft.qualities);
  const checkpoints = useDraftStore((state) => state.draft.checkpoints).map((checkpoint) => checkpoint.id);
  const patch = (value: Partial<Observation>) => mutate((current) => {
    const next = { ...observation, ...value };
    (Object.keys(next) as Array<keyof Observation>).forEach((key) => { if (next[key] === undefined) delete next[key]; });
    return updateObservation(current, next);
  });
  const warnings = [
    ...(imposesMind(observation.text) ? ["Says what the player feels or concludes"] : []),
    ...(instructs(observation.text) ? ["Tells the player what to do"] : []),
  ];
  return (
    <div data-so="observation-row" className="st-subpanel flex flex-col gap-2 p-2">
      <div className="flex flex-wrap items-end gap-2">
        <span className="st-pill px-2 py-0.5 text-[11px]">{observation.id}</span>
        <TextField label={`${observation.id} text`} value={observation.text} onChange={(text) => patch({ text })} />
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs st-muted">From</span>
          <select aria-label={`${observation.id} source`} value={observation.source ?? ""} onChange={(event) => patch({ source: optionalText(event.target.value) })}>
            <option value="">(nobody)</option>
            {sources.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs st-muted">Revision</span>
          <input type="number" min={1} className="text_pole st-input w-16" aria-label={`${observation.id} rev`} value={observation.rev ?? 1}
            onChange={(event) => { const rev = whole(event.target.value, 1); if (rev !== null) patch({ rev: rev > 1 ? rev : undefined }); }} />
        </label>
        <button type="button" className="st-button danger" aria-label={`Remove observation ${observation.id}`}
          onClick={() => mutate((current) => removeObservation(current, observation.id))}>×</button>
      </div>
      {warnings.length > 0 && <div data-so="observation-warning" role="note" className="text-xs st-warn">{warnings.join(". ")}. Write only what is there to see.</div>}
      <WhenField label={`${observation.id} noticed when`} when={observation.when} qualities={qualities} checkpoints={checkpoints} onChange={(when) => patch({ when })} />
      <PassiveField label={observation.id} passive={observation.passive} onChange={(passive) => patch({ passive })} />
    </div>
  );
};

const ObservationsEditor: React.FC = () => {
  const draft = useDraftStore((state) => state.draft);
  const mutate = useDraftStore((state) => state.mutate);
  const list = draft.observations ?? [];
  const shown = draft.display?.observations !== false;
  const sources = [...new Set([...(draft.codex?.people ?? []), ...(draft.codex?.places ?? [])].map((entry) => entry.id).concat(draft.roster.map((member) => member.id)))];
  const add = () => mutate((current) => updateObservation(current, {
    id: nextId((current.observations ?? []).map((item) => item.id), "detail"), text: "Something is there to see.", when: { reached: current.checkpoints[0]?.id ?? "" },
  }));
  return (
    <div id="so-observations-editor" data-so="observations-editor" className="st-subpanel flex flex-col gap-3 p-3">
      <div className="text-sm font-medium">Things the player notices<HelpTooltip title={HELP} /></div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" aria-label="Show what the player notices" checked={shown} onChange={(event) => mutate((current) => setObservationsShown(current, event.target.checked))} />
        Show what the player notices
      </label>
      {list.map((observation) => <ObservationRow key={observation.id} observation={observation} sources={sources} />)}
      <button type="button" className="st-button secondary self-start" onClick={add}>+ Detail</button>
    </div>
  );
};

export default ObservationsEditor;
