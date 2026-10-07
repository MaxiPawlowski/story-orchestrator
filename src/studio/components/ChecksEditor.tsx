import React from "react";
import type { QualityDisplay, StoryCheck } from "@engine/index";
import HelpTooltip from "@components/studio/HelpTooltip";
import { useDraftStore } from "../draft";
import { setCheckpointChecks, setQualityDisplay, setTransitionCheck } from "../gameMutations";
import { JsonField } from "./GameFields";

const CHECK_HINT = '[{"id", "quality", "roll": {"sides", "target", "dice"?}, "modifiers"?, "narrate": "public|hidden", "outcome"?, "twist"?}]';
const CHECKS_HELP = "A check rolls seeded dice when its checkpoint is reached, or when the rest of its transition's gate holds, and writes its bool quality.";
const DISPLAY_HELP = "Mark a quality public to show it on the Stat sheet and in story panels. Relationship qualities and checkpoint-gated entries cannot be public.";
const DISPLAY_HINT = '{"public": true, "label", "as": "meter|count|word|item|boxes", "group"?, "min"?, "max"?, "bands"?}';

export const ChecksEditor: React.FC = () => {
  const checkpoints = useDraftStore((state) => state.draft.checkpoints);
  const transitions = useDraftStore((state) => state.draft.transitions);
  const mutate = useDraftStore((state) => state.mutate);
  return (
    <div data-so="checks-editor" className="st-subpanel flex flex-col gap-2 p-3">
      <div className="text-sm font-medium">Checks<HelpTooltip title={CHECKS_HELP} /></div>
      {checkpoints.map((checkpoint) => (
        <JsonField key={checkpoint.id} label={`Checks at ${checkpoint.name || checkpoint.id}`} hint={CHECK_HINT} value={checkpoint.checks}
          onChange={(checks) => mutate((current) => setCheckpointChecks(current, checkpoint.id, Array.isArray(checks) ? (checks as StoryCheck[]) : []))} />
      ))}
      {transitions.map((transition, index) => (
        <JsonField key={`${transition.from}-${transition.to}-${index}`} label={`Check on ${transition.from} → ${transition.to}`} value={transition.check}
          onChange={(check) => mutate((current) => setTransitionCheck(current, index, check as StoryCheck | undefined))} />
      ))}
    </div>
  );
};

export const QualityDisplayEditor: React.FC = () => {
  const qualities = useDraftStore((state) => state.draft.qualities);
  const mutate = useDraftStore((state) => state.mutate);
  return (
    <div data-so="quality-display-editor" className="st-subpanel flex flex-col gap-2 p-3">
      <div className="text-sm font-medium">Public qualities<HelpTooltip title={DISPLAY_HELP} /></div>
      {qualities.map((quality) => (
        <JsonField key={quality.key} label={`Display ${quality.key}`} hint={DISPLAY_HINT} value={quality.display}
          onChange={(display) => mutate((current) => setQualityDisplay(current, quality.key, display as QualityDisplay | undefined))} />
      ))}
    </div>
  );
};
