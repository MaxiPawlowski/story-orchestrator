import React, { useEffect, useState } from "react";
import { ILLUSTRATION_PURPOSES, type WorkflowMap } from "@engine/schema";
import { listComfyWorkflows } from "@services/stHost/comfyWorkflows";

const PURPOSE_LABELS: Record<(typeof ILLUSTRATION_PURPOSES)[number], string> = {
  scene: "Scenes", character: "Characters", portrait: "Portraits", user: "The player", background: "Backgrounds", free: "Other pictures",
};

export const useWorkflowNames = (read: () => Promise<string[] | null> = listComfyWorkflows): string[] | null => {
  const [names, setNames] = useState<string[] | null>(null);
  useEffect(() => {
    let live = true;
    void read().then((found) => { if (live) setNames(found); });
    return () => { live = false; };
  }, [read]);
  return names;
};

const WorkflowMapEditor: React.FC<{
  value: WorkflowMap | undefined;
  names: string[] | null;
  inherited?: string;
  onChange: (next: WorkflowMap | undefined) => void;
}> = ({ value, names, inherited, onChange }) => {
  const set = (purpose: (typeof ILLUSTRATION_PURPOSES)[number], name: string) => {
    const next: WorkflowMap = { ...(value ?? {}) };
    if (name) next[purpose] = name; else delete next[purpose];
    onChange(Object.keys(next).length ? next : undefined);
  };
  return <div data-so="workflow-map" className="flex flex-col gap-1">
    {names === null ? <p className="text-xs st-muted" data-so="workflow-list-unavailable">SillyTavern's ComfyUI workflow list is not available; names can still be typed.</p> : null}
    {ILLUSTRATION_PURPOSES.map((purpose) => {
      const current = value?.[purpose] ?? "";
      const known = !current || names === null || names.includes(current);
      return <label key={purpose} className="flex flex-col gap-1 text-sm">
        <span className="text-xs st-muted">{PURPOSE_LABELS[purpose]}</span>
        <input className="text_pole st-input" aria-label={`${PURPOSE_LABELS[purpose]} workflow`} list="so-comfy-workflows" value={current}
          placeholder={inherited ?? "Your own workflow"} onChange={(event) => set(purpose, event.target.value.trim())} />
        {known ? null : <span className="text-xs so-warning-text" data-so="workflow-not-installed">Not installed here: players without it get their own workflow.</span>}
      </label>;
    })}
    <datalist id="so-comfy-workflows">{(names ?? []).map((name) => <option key={name} value={name} />)}</datalist>
  </div>;
};

export default WorkflowMapEditor;
