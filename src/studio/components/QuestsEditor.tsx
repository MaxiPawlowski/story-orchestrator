import React, { useState } from "react";
import type { Quest, QuestReward, QuestStep } from "@engine/index";
import HelpTooltip from "@components/studio/HelpTooltip";
import { useDraftStore } from "../draft";
import { addQuest, newQuest, removeQuest, updateQuest } from "../gameMutations";
import GateBuilder from "./GateBuilder";
import { JsonField, OptionalGate, TextField, optionalText } from "./GameFields";

const HELP = "A side quest's status is computed from qualities every turn: hidden, offered, active, done or failed. Titles and steps are player copy: name nothing the player has not reached.";

const StepRow = ({ quest, step, index }: { quest: Quest; step: QuestStep; index: number }) => {
  const mutate = useDraftStore((state) => state.mutate);
  const qualities = useDraftStore((state) => state.draft.qualities);
  const steps = (next: QuestStep[]) => mutate((current) => updateQuest(current, quest.id, { steps: next }));
  const patch = (value: Partial<QuestStep>) => steps(quest.steps.map((entry, at) => (at === index ? { ...entry, ...value } : entry)));
  const name = `${quest.id} step ${index + 1}`;
  return (
    <div data-so="quest-step-row" className="st-subpanel flex flex-col gap-2 p-2">
      <div className="flex items-end gap-2">
        <TextField label={`${name} text`} value={step.text} onChange={(text) => patch({ text })} />
        <button type="button" className="st-button danger" aria-label={`Remove ${name}`} onClick={() => steps(quest.steps.filter((_, at) => at !== index))}>×</button>
      </div>
      <GateBuilder gate={step.done_when} qualities={qualities} onChange={(done_when) => patch({ done_when })} />
      <OptionalGate label={`${name} shows only when`} gate={step.visible_when} qualities={qualities} onChange={(visible_when) => patch({ visible_when })} />
    </div>
  );
};

const QuestRow = ({ quest }: { quest: Quest }) => {
  const mutate = useDraftStore((state) => state.mutate);
  const qualities = useDraftStore((state) => state.draft.qualities);
  const patch = (value: Partial<Omit<Quest, "id">>) => mutate((current) => updateQuest(current, quest.id, value));
  const name = quest.id;
  return (
    <div data-so="quest-row" data-quest={quest.id} className="st-subpanel flex flex-col gap-2 p-2">
      <div className="flex flex-wrap items-end gap-2">
        <span className="st-pill px-2 py-0.5 text-[11px]">{quest.id}</span>
        <TextField label={`${name} title`} value={quest.title} onChange={(title) => patch({ title })} />
        <TextField label={`${name} giver`} value={quest.giver ?? ""} placeholder="roster id" onChange={(giver) => patch({ giver: optionalText(giver) })} />
        <button type="button" className="st-button danger" aria-label={`Remove quest ${name}`} onClick={() => mutate((current) => removeQuest(current, quest.id))}>×</button>
      </div>
      <OptionalGate label={`${name} visible when`} gate={quest.visible_when} qualities={qualities} onChange={(visible_when) => patch({ visible_when })} />
      <OptionalGate label={`${name} offered when`} gate={quest.offered_when} qualities={qualities} onChange={(offered_when) => patch({ offered_when })} />
      <OptionalGate label={`${name} failed when`} gate={quest.failed_when} qualities={qualities} onChange={(failed_when) => patch({ failed_when })} />
      <div className="flex flex-col gap-2">
        <div className="text-xs st-muted">Steps (with none, give the quest its own done condition below)</div>
        {quest.steps.map((step, index) => <StepRow key={index} quest={quest} step={step} index={index} />)}
        <button type="button" className="st-button secondary self-start" onClick={() => patch({ steps: [...quest.steps, { text: "", done_when: { all: [] } }] })}>+ Step</button>
      </div>
      {!quest.steps.length && <OptionalGate label={`${name} done when`} gate={quest.done_when} qualities={qualities} onChange={(done_when) => patch({ done_when: done_when ?? { all: [] } })} />}
      <TextField label={`${name} author note`} value={quest.author_note ?? ""} placeholder="never shown to players" onChange={(note) => patch({ author_note: optionalText(note) })} />
      <JsonField label={`${name} reward`} hint="{set?, effects?: {world_info, cast_changes, npc_replies}, label?, visible_when?}" value={quest.reward}
        onChange={(reward) => patch({ reward: reward as QuestReward | undefined })} />
    </div>
  );
};

const QuestsEditor: React.FC = () => {
  const quests = useDraftStore((state) => state.draft.quests ?? []);
  const mutate = useDraftStore((state) => state.mutate);
  const [id, setId] = useState("");
  return (
    <div data-so="quests-editor" className="st-subpanel flex flex-col gap-2 p-3">
      <div className="text-sm font-medium">Quests<HelpTooltip title={HELP} /></div>
      {!quests.length && <div className="text-xs st-muted">No side quests yet. The main line is the checkpoint graph.</div>}
      {quests.map((quest) => <QuestRow key={quest.id} quest={quest} />)}
      <div className="flex items-end gap-2">
        <TextField label="New quest id" value={id} onChange={setId} />
        <button type="button" className="st-button secondary" onClick={() => {
          mutate((current) => addQuest(current, id.trim() ? newQuest(id.trim()) : undefined));
          setId("");
        }}>+ Quest</button>
      </div>
    </div>
  );
};

export default QuestsEditor;
