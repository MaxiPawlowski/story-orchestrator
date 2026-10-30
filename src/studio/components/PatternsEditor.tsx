import React from "react";
import { PATTERN_ATTRS, PATTERN_KINDS, PATTERN_STEPS_MAX, PATTERN_REPEATS, type PatternKind, type PatternStep, type PatternUnless, type StoryPattern } from "@engine/patternSchema";
import HelpTooltip from "@components/studio/HelpTooltip";
import { useDraftStore } from "../draft";
import { addPattern, removePattern, updatePattern } from "../gameMutations";
import { JsonField, optionalText, TextField } from "./GameFields";
import { Button } from "@components/ui/Button";
import { IconButton } from "@components/ui/IconButton";

const HELP = "A pattern notices an order of things the player saw happen: a reached checkpoint, a quest that moved, a milestone, a public check. When it completes, "
  + "your label joins What changed and your hint goes to the narrator for 3 turns. Matched in code, never by a model, and never a cause. \"?name\" binds the same value across steps.";
const WHERE_HINT = '{"giver": "?who"}';
const UNLESS_HINT = '[{"kind": "check", "id": "climb", "to": "failure", "between": [1, 2]}]';

const toInt = (text: string): number | undefined => (text.trim() && Number.isInteger(Number(text)) ? Number(text) : undefined);

const StepRow = ({ pattern, step, at }: { pattern: StoryPattern; step: PatternStep; at: number }) => {
  const mutate = useDraftStore((state) => state.mutate);
  const patch = (value: Partial<PatternStep>) => mutate((current) => updatePattern(current, pattern.id, {
    steps: pattern.steps.map((entry, index) => (index === at ? { ...entry, ...value } : entry)),
  }));
  const label = `${pattern.id} step ${at + 1}`;
  const attrs: readonly string[] = PATTERN_ATTRS[step.kind];
  return (
    <div data-so="pattern-step-row" className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs st-muted">Step {at + 1}</span>
        <select className="text_pole st-input" aria-label={`${label} kind`} value={step.kind}
          onChange={(event) => patch({ kind: event.target.value as PatternKind, id: undefined, to: undefined, where: undefined })}>
          {PATTERN_KINDS.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
        </select>
      </label>
      {attrs.includes("id") && <TextField label={`${label} id`} value={step.id ?? ""} onChange={(id) => patch({ id: optionalText(id) })} />}
      {step.kind !== "milestone" && (
        <TextField label={`${label} ${step.kind === "check" ? "outcome" : "to"}`} value={step.to ?? ""} onChange={(to) => patch({ to: optionalText(to) })} />
      )}
      <JsonField label={`${label} where`} hint={WHERE_HINT} value={step.where}
        onChange={(where) => patch({ where: where && typeof where === "object" ? where as Record<string, string> : undefined })} />
      <IconButton icon="fa-xmark" label={`Remove ${label}`} type="button" disabled={pattern.steps.length <= 1}
        onClick={() => mutate((current) => updatePattern(current, pattern.id, { steps: pattern.steps.filter((_, index) => index !== at) }))} />
    </div>
  );
};

const PatternRow = ({ pattern }: { pattern: StoryPattern }) => {
  const mutate = useDraftStore((state) => state.mutate);
  const patch = (value: Partial<Omit<StoryPattern, "id">>) => mutate((current) => updatePattern(current, pattern.id, value));
  return (
    <div data-so="pattern-editor-row" data-pattern={pattern.id} className="st-subpanel flex flex-col gap-2 p-2">
      <div className="flex flex-wrap items-end gap-2">
        <span className="st-pill px-2 py-0.5 text-[11px]">{pattern.id}</span>
        <TextField label={`${pattern.id} within`} value={pattern.within === undefined ? "" : String(pattern.within)} placeholder="any"
          onChange={(within) => patch({ within: toInt(within) })} />
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs st-muted">Completes</span>
          <select className="text_pole st-input" aria-label={`${pattern.id} repeat`} value={pattern.repeat ?? "once"}
            onChange={(event) => patch({ repeat: event.target.value as StoryPattern["repeat"] })}>
            {PATTERN_REPEATS.map((repeat) => <option key={repeat} value={repeat}>{repeat}</option>)}
          </select>
        </label>
        <IconButton icon="fa-xmark" label={`Remove pattern ${pattern.id}`} type="button" onClick={() => mutate((current) => removePattern(current, pattern.id))} />
      </div>
      {pattern.steps.map((step, at) => <StepRow key={at} pattern={pattern} step={step} at={at} />)}
      <Button type="button" className="self-start" disabled={pattern.steps.length >= PATTERN_STEPS_MAX}
        onClick={() => patch({ steps: [...pattern.steps, { kind: pattern.steps.at(-1)?.kind ?? "milestone" }] })}>+ Step</Button>
      <JsonField label={`${pattern.id} unless`} hint={UNLESS_HINT} value={pattern.unless}
        onChange={(unless) => patch({ unless: Array.isArray(unless) ? unless as PatternUnless[] : undefined })} />
      <TextField label={`${pattern.id} callback line`} value={pattern.label?.text ?? ""} onChange={(text) => patch({ label: text.trim() ? { text } : undefined })} />
      <TextField label={`${pattern.id} narrator hint`} value={pattern.hint ?? ""} onChange={(hint) => patch({ hint: optionalText(hint) })} />
      <TextField label={`${pattern.id} one step left`} value={pattern.pending ?? ""} onChange={(pending) => patch({ pending: optionalText(pending) })} />
    </div>
  );
};

const PatternsEditor: React.FC = () => {
  const patterns = useDraftStore((state) => state.draft.patterns) ?? [];
  const mutate = useDraftStore((state) => state.mutate);
  return (
    <div data-so="patterns-editor" className="st-subpanel flex flex-col gap-2 p-3">
      <div className="text-sm font-medium">Story patterns<HelpTooltip title={HELP} /></div>
      {patterns.map((pattern) => <PatternRow key={pattern.id} pattern={pattern} />)}
      <Button type="button" className="self-start" onClick={() => mutate((current) => addPattern(current))}>+ Pattern</Button>
    </div>
  );
};

export default PatternsEditor;
