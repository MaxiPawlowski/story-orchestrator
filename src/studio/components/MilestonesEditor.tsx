import React from "react";
import type { Milestone } from "@engine/index";
import HelpTooltip from "@components/studio/HelpTooltip";
import { useDraftStore } from "../draft";
import { addMilestone, removeMilestone, updateMilestone } from "../gameMutations";
import GateBuilder from "./GateBuilder";
import { TextField } from "./GameFields";

const HELP = "A milestone is earned once its condition holds and stays earned. A secret one is listed only after it is earned.";

const MilestoneRow = ({ milestone }: { milestone: Milestone }) => {
  const mutate = useDraftStore((state) => state.mutate);
  const qualities = useDraftStore((state) => state.draft.qualities);
  const patch = (value: Partial<Omit<Milestone, "id">>) => mutate((current) => updateMilestone(current, milestone.id, value));
  return (
    <div data-so="milestone-row" className="st-subpanel flex flex-col gap-2 p-2">
      <div className="flex flex-wrap items-end gap-2">
        <span className="st-pill px-2 py-0.5 text-[11px]">{milestone.id}</span>
        <TextField label={`${milestone.id} title`} value={milestone.title} onChange={(title) => patch({ title })} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" aria-label={`${milestone.id} secret`} checked={milestone.secret === true}
            onChange={(event) => patch({ secret: event.target.checked ? true : undefined })} />
          Secret
        </label>
        <button type="button" className="st-button danger" aria-label={`Remove milestone ${milestone.id}`} onClick={() => mutate((current) => removeMilestone(current, milestone.id))}>×</button>
      </div>
      <GateBuilder gate={milestone.when} qualities={qualities} onChange={(when) => patch({ when })} />
    </div>
  );
};

const MilestonesEditor: React.FC = () => {
  const milestones = useDraftStore((state) => state.draft.milestones) ?? [];
  const mutate = useDraftStore((state) => state.mutate);
  return (
    <div data-so="milestones-editor" className="st-subpanel flex flex-col gap-2 p-3">
      <div className="text-sm font-medium">Milestones<HelpTooltip title={HELP} /></div>
      {milestones.map((milestone) => <MilestoneRow key={milestone.id} milestone={milestone} />)}
      <button type="button" className="st-button secondary self-start" onClick={() => mutate((current) => addMilestone(current))}>+ Milestone</button>
    </div>
  );
};

export default MilestonesEditor;
