import React from "react";
import { ECHO_CHECK_OUTCOMES, ECHO_NARRATOR, ECHO_QUEST_ENDS, echoRange, echoUnit, type EchoAfter, type EchoQuestEnd, type StoryEcho } from "@engine/echoSchema";
import { transitionIds } from "@engine/validate/echoes";
import { checksById } from "@engine/storyChecks";
import HelpTooltip from "@components/studio/HelpTooltip";
import { useDraftStore } from "../draft";
import type { StoryDraft } from "../draft";
import { addEcho, removeEcho, updateEcho } from "../gameMutations";
import { narratesPlayer } from "../cueDiagnostics";
import { OptionalGate, TextField } from "./GameFields";
import { Button } from "@components/ui/Button";
import { IconButton } from "@components/ui/IconButton";

const HELP = "Something that happened comes back later. After the event and a delay, if the story still fits, one character or the narrator is handed one short cue, "
  + "once per chat. It waits while its gate fails or the character is away, and is dropped if it expires first. No model call, nothing a gate can read.";

type Kind = "transition" | "quest" | "milestone" | "check";

const kindOf = (after: EchoAfter): Kind => ("transition" in after ? "transition" : "quest" in after ? "quest" : "milestone" in after ? "milestone" : "check");

const toInt = (text: string, fallback: number) => (Number.isInteger(Number(text)) && text.trim() ? Number(text) : fallback);

const sourceIds = (draft: StoryDraft, kind: Kind): string[] => {
  if (kind === "transition") return transitionIds(draft.transitions);
  if (kind === "quest") return (draft.quests ?? []).map((quest) => quest.id);
  if (kind === "milestone") return (draft.milestones ?? []).map((milestone) => milestone.id);
  return [...checksById({ checkpoints: draft.checkpoints, transitions: draft.transitions }).keys()];
};

const afterFor = (kind: Kind, id: string, previous: EchoAfter): EchoAfter => {
  if (kind === "transition") return { transition: id };
  if (kind === "quest") return { quest: id, to: "to" in previous && isQuestEnd(previous.to) ? previous.to : "done" };
  if (kind === "milestone") return { milestone: id };
  return { check: id, outcome: "outcome" in previous ? previous.outcome : "success" };
};

const isQuestEnd = (value: string): value is EchoQuestEnd => (ECHO_QUEST_ENDS as readonly string[]).includes(value);

const Select: React.FC<{ label: string; value: string; options: readonly string[]; onChange: (value: string) => void; names?: Record<string, string> }> = ({
  label, value, options, onChange, names,
}) => (
  <label className="flex flex-col gap-1 text-sm">
    <span className="text-xs st-muted">{label}</span>
    <select className="text_pole st-input" aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
      {!options.includes(value) && <option value={value}>{value || "(choose)"}</option>}
      {options.map((option) => <option key={option} value={option}>{names?.[option] ?? option}</option>)}
    </select>
  </label>
);

const SourcePicker: React.FC<{ echo: StoryEcho; patch: (value: Partial<StoryEcho>) => void }> = ({ echo, patch }) => {
  const draft = useDraftStore((state) => state.draft);
  const kind = kindOf(echo.after);
  const ids = sourceIds(draft, kind);
  const id = "transition" in echo.after ? echo.after.transition : "quest" in echo.after ? echo.after.quest : "milestone" in echo.after ? echo.after.milestone : echo.after.check;
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Select label={`echo ${echo.id} after`} value={kind} options={["transition", "quest", "milestone", "check"]}
        onChange={(next) => patch({ after: afterFor(next as Kind, sourceIds(draft, next as Kind)[0] ?? "", echo.after) })} />
      <Select label={`echo ${echo.id} source`} value={id} options={ids} onChange={(next) => patch({ after: afterFor(kind, next, echo.after) })} />
      {"quest" in echo.after && (
        <Select label={`echo ${echo.id} quest ends`} value={echo.after.to} options={ECHO_QUEST_ENDS}
          onChange={(to) => patch({ after: { quest: id, to: isQuestEnd(to) ? to : "done" } })} />
      )}
      {"check" in echo.after && (
        <Select label={`echo ${echo.id} outcome`} value={echo.after.outcome} options={ECHO_CHECK_OUTCOMES} onChange={(outcome) => patch({ after: { check: id, outcome } })} />
      )}
    </div>
  );
};

const TimingFields: React.FC<{ echo: StoryEcho; patch: (value: Partial<StoryEcho>) => void }> = ({ echo, patch }) => {
  const clock = useDraftStore((state) => Boolean(state.draft.clock));
  const unit = echoUnit(echo.delay);
  const [from, to] = echoRange(echo.delay);
  const delay = (range: [number, number], next = unit) => patch({ delay: next === "parts" ? { parts: range } : { boundaries: range }, ...(next !== unit ? { expires: undefined } : {}) });
  const expires = echo.expires && unit in echo.expires ? (echo.expires as Record<string, number>)[unit] : undefined;
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Select label={`echo ${echo.id} delay in`} value={unit} options={clock ? ["boundaries", "parts"] : ["boundaries"]}
        names={{ boundaries: "turns", parts: "day parts" }} onChange={(next) => delay([from, to], next === "parts" ? "parts" : "boundaries")} />
      <TextField label={`echo ${echo.id} delay from`} value={String(from)} onChange={(value) => delay([toInt(value, from), to])} />
      <TextField label={`echo ${echo.id} delay to`} value={String(to)} onChange={(value) => delay([from, toInt(value, to)])} />
      <TextField label={`echo ${echo.id} expires after`} value={expires === undefined ? "" : String(expires)}
        onChange={(value) => patch({ expires: value.trim() ? (unit === "parts" ? { parts: toInt(value, 0) } : { boundaries: toInt(value, 0) }) : undefined })} />
      <TextField label={`echo ${echo.id} hold`} value={echo.hold === undefined ? "" : String(echo.hold)}
        onChange={(value) => patch({ hold: value.trim() ? toInt(value, 2) : undefined })} />
    </div>
  );
};

const EchoRow: React.FC<{ echo: StoryEcho }> = ({ echo }) => {
  const mutate = useDraftStore((state) => state.mutate);
  const draft = useDraftStore((state) => state.draft);
  const patch = (value: Partial<StoryEcho>) => mutate((current) => updateEcho(current, echo.id, value));
  const recipients = [...draft.roster.map((member) => member.id), ...(draft.roster.some((member) => member.view === "omniscient") ? [ECHO_NARRATOR] : [])];
  const names = Object.fromEntries(draft.roster.map((member) => [member.id, member.name ?? member.id]));
  return (
    <div data-so="echo-row" data-echo={echo.id} className="st-subpanel flex flex-col gap-2 p-2">
      <div className="flex flex-wrap items-end gap-2">
        <span className="st-pill px-2 py-0.5 text-[11px]">{echo.id}</span>
        <Select label={`echo ${echo.id} tells`} value={echo.to} options={recipients} names={{ ...names, [ECHO_NARRATOR]: "the narrator" }} onChange={(to) => patch({ to })} />
        <IconButton icon="fa-xmark" label={`Remove echo ${echo.id}`} onClick={() => mutate((current) => removeEcho(current, echo.id))} />
      </div>
      <SourcePicker echo={echo} patch={patch} />
      <TextField label={`echo ${echo.id} cue`} value={echo.cue} onChange={(cue) => patch({ cue })} placeholder="the trader the player short-changed is in town" />
      {narratesPlayer(echo.cue) && <div data-so="echo-warning" role="note" className="text-xs st-warn">Says what the player does or feels. Say what comes back instead.</div>}
      <TimingFields echo={echo} patch={patch} />
      <OptionalGate label={`echo ${echo.id} lands only when`} gate={echo.when} qualities={draft.qualities} onChange={(when) => patch({ when })} />
      <OptionalGate label={`echo ${echo.id} is cancelled when`} gate={echo.cancel_when} qualities={draft.qualities} onChange={(cancel_when) => patch({ cancel_when })} />
    </div>
  );
};

const EchoesEditor: React.FC = () => {
  const echoes = useDraftStore((state) => state.draft.echoes) ?? [];
  const roster = useDraftStore((state) => state.draft.roster);
  const mutate = useDraftStore((state) => state.mutate);
  return (
    <div id="so-echoes-editor" data-so="echoes-editor" className="st-subpanel flex flex-col gap-3 p-3">
      <div className="text-sm font-medium">Delayed echoes<HelpTooltip title={HELP} /></div>
      {echoes.map((echo) => <EchoRow key={echo.id} echo={echo} />)}
      <Button className="self-start" disabled={!roster.length} onClick={() => mutate((current) => addEcho(current))}>+ Echo</Button>
    </div>
  );
};

export default EchoesEditor;
