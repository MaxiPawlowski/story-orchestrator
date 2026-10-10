import React, { useState } from "react";
import type { BundledWorkflow } from "@engine/schema";
import { checkWorkflowGraph } from "../../image/workflows";
import type { InstallOutcome } from "../workflowBundle";

const installText = (outcome: InstallOutcome): string => {
  if (!outcome.ok) return outcome.reason;
  if (outcome.present) return `Already installed as ${outcome.name}.`;
  return `Installed as ${outcome.name}${outcome.renamedFrom ? ` (a different ${outcome.renamedFrom} exists and was left alone)` : ""}.`;
};

const BundledWorkflowsPanel: React.FC<{
  bundle: Record<string, BundledWorkflow> | undefined;
  mapped: string[];
  nodes: string[] | null;
  onBundle: () => Promise<string>;
  onInstall: (name: string, entry: BundledWorkflow) => Promise<InstallOutcome>;
  onDrop: (name: string) => void;
}> = ({ bundle, mapped, nodes, onBundle, onInstall, onDrop }) => {
  const [status, setStatus] = useState<Record<string, string>>({});
  const [bundling, setBundling] = useState<string | null>(null);
  const entries = Object.entries(bundle ?? {});
  return <div data-so="workflow-bundle" className="flex flex-col gap-2">
    <div className="flex items-center gap-2">
      <button type="button" className="menu_button" data-so="workflow-bundle-export" disabled={!mapped.length}
        onClick={() => { void onBundle().then(setBundling); }}>Export with workflows</button>
      <span className="text-xs st-muted">Copies the mapped workflows into the story, so another install can add them.</span>
    </div>
    {bundling ? <p role="status" className="text-xs">{bundling}</p> : null}
    {entries.map(([name, entry]) => {
      const check = checkWorkflowGraph(entry.graph, nodes);
      return <div key={name} data-so="workflow-bundle-card" className="st-subpanel flex flex-col gap-1 p-2 text-xs">
        <div className="text-sm font-medium">{name}</div>
        <div>Node classes: {check.nodes.join(", ") || "none"}</div>
        {check.models.length ? <div>Models it loads: {check.models.join(", ")}</div> : null}
        {nodes === null ? <div className="st-muted">This ComfyUI's nodes could not be listed; missing nodes are not checked.</div> : null}
        {check.missingNodes.length ? <div className="so-warning-text" data-so="workflow-missing-nodes">
          Not on this ComfyUI: {check.missingNodes.join(", ")}. Nodes are never installed for you.</div> : null}
        {check.deniedNodes.length ? <div className="so-warning-text" data-so="workflow-denied-nodes">
          Can run code or read files: {check.deniedNodes.join(", ")}. This workflow is never installed from a story.</div> : null}
        {check.hasPrompt ? null : <div className="so-warning-text">No "%prompt%" placeholder: it would ignore the scene.</div>}
        <div className="flex gap-2">
          <button type="button" className="menu_button" data-so="workflow-bundle-install" disabled={Boolean(check.deniedNodes.length) || !check.hasPrompt}
            onClick={() => {
              void onInstall(name, entry).then((outcome) => setStatus((prev) => ({ ...prev, [name]: installText(outcome) })));
            }}>Install in SillyTavern</button>
          <button type="button" className="menu_button" data-so="workflow-bundle-drop" onClick={() => onDrop(name)}>Remove from story</button>
        </div>
        {status[name] ? <p role="status">{status[name]}</p> : null}
      </div>;
    })}
  </div>;
};

export default BundledWorkflowsPanel;
