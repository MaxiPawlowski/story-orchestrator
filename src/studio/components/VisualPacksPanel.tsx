import React from "react";
import type { StoryVisualPacks, VisualPackRef } from "@engine/schema";
import { Button } from "@components/ui/Button";

type Group = "identities" | "places";

export const withoutPackBinding = (packs: StoryVisualPacks | undefined, group: Group | "style", key?: string): StoryVisualPacks | undefined => {
  const next: StoryVisualPacks = { ...packs };
  if (group === "style") delete next.style;
  else if (key !== undefined) {
    const { [key]: _dropped, ...rest } = packs?.[group] ?? {};
    if (Object.keys(rest).length) next[group] = rest;
    else delete next[group];
  }
  return Object.keys(next).length ? next : undefined;
};

const Row: React.FC<{ label: string; binding: VisualPackRef; onRemove: () => void }> = ({ label, binding, onRemove }) => (
  <div data-so="visual-pack-binding" className="flex items-center gap-2 text-xs">
    <span className="font-medium">{label}</span>
    <span>{binding.id}</span>
    <span className="st-muted" title={binding.digest}>{binding.digest.slice(0, 12)}</span>
    <Button type="button" aria-label={`Remove the visual pack of ${label}`} onClick={onRemove}>Remove</Button>
  </div>
);

const VisualPacksPanel: React.FC<{
  packs: StoryVisualPacks | undefined;
  memberNames: Record<string, string>;
  checkpointNames: Record<string, string>;
  onChange: (packs: StoryVisualPacks | undefined) => void;
}> = ({ packs, memberNames, checkpointNames, onChange }) => {
  const identities = Object.entries(packs?.identities ?? {}), places = Object.entries(packs?.places ?? {});
  return <div data-so="visual-packs" className="flex flex-col gap-2">
    <div className="text-sm font-medium">Visual packs <span className="st-muted font-normal">— prepared art this story draws from</span></div>
    <div className="text-xs st-muted">A pack export writes these bindings; each pins one pack revision by its digest. Install the packs on this SillyTavern for the stage,
      the cast scene and pictures to use them; a missing pack falls back to text and the picture says so.</div>
    {!packs ? <div className="text-xs st-muted">No visual packs are bound.</div> : null}
    {packs?.style ? <Row label="Style" binding={packs.style} onRemove={() => onChange(withoutPackBinding(packs, "style"))} /> : null}
    {identities.map(([id, binding]) => <Row key={`identity-${id}`} label={memberNames[id] ?? id} binding={binding}
      onRemove={() => onChange(withoutPackBinding(packs, "identities", id))} />)}
    {places.map(([id, binding]) => <Row key={`place-${id}`} label={checkpointNames[id] ?? id} binding={binding}
      onRemove={() => onChange(withoutPackBinding(packs, "places", id))} />)}
  </div>;
};

export default VisualPacksPanel;
