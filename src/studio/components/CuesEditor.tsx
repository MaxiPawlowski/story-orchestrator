import React from "react";
import type { MemberCue, MemberTopic, Quality, RosterMember, TopicTier } from "@engine/index";
import HelpTooltip from "@components/studio/HelpTooltip";
import { useDraftStore } from "../draft";
import { removeCue, removeTopic, setCue, setTopic } from "../gameMutations";
import { nextId } from "../mutations";
import { narratesPlayer } from "../cueDiagnostics";
import GateBuilder from "./GateBuilder";
import { OptionalGate, TextField } from "./GameFields";
import { Button } from "@components/ui/Button";
import { IconButton } from "@components/ui/IconButton";

const HELP = "Things a character notices. A remark holds while its condition holds; a reaction answers an event for a few turns. A must cue is offered again until it lands. "
  + "Only that character is handed one cue per reply, privately, and may use it in its own words. A broad cue at priority 0 with specific ones above it reads best.";
const TOPIC_HELP = "Subjects the player can raise with this character by name (\"Mara, about the ledger...\"). Each answered raise goes one tier deeper; a tier with a condition waits for it.";

const whole = (value: string, min: number, max: number): number | null => {
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : null;
};

const clean = <T extends object>(value: T): T => {
  const copy = { ...value };
  (Object.keys(copy) as Array<keyof T>).forEach((key) => { if (copy[key] === undefined) delete copy[key]; });
  return copy;
};

const NumberField: React.FC<{ label: string; value: number; min: number; max: number; onChange: (value: number) => void }> = ({ label, value, min, max, onChange }) => (
  <label className="flex flex-col gap-1 text-sm">
    <span className="text-xs st-muted">{label}</span>
    <input type="number" min={min} max={max} className="text_pole st-input w-20" aria-label={label} value={value}
      onChange={(event) => { const next = whole(event.target.value, min, max); if (next !== null) onChange(next); }} />
  </label>
);

const CueRow: React.FC<{ member: RosterMember; cue: MemberCue; qualities: Quality[] }> = ({ member, cue, qualities }) => {
  const mutate = useDraftStore((state) => state.mutate);
  const name = `${member.id} cue ${cue.id}`;
  const patch = (value: Partial<MemberCue>) => mutate((current) => setCue(current, member.id, clean({ ...cue, ...value })));
  const must = cue.lane === "must";
  return (
    <div data-so="cue-row" data-member={member.id} className="st-subpanel flex flex-col gap-2 p-2">
      <div className="flex flex-wrap items-end gap-2">
        <span className="st-pill px-2 py-0.5 text-[11px]">{cue.id}</span>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs st-muted">Kind</span>
          <select aria-label={`${name} kind`} value={cue.kind} onChange={(event) => patch({ kind: event.target.value as MemberCue["kind"], window: undefined })}>
            <option value="reaction">Reaction to an event</option>
            <option value="remark">Remark while it holds</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs st-muted">Lane</span>
          <select aria-label={`${name} lane`} value={must ? "must" : "may"}
            onChange={(event) => patch(event.target.value === "must"
              ? { lane: "must", landed_when: { all: [] }, repeat: undefined } : { lane: undefined, landed_when: undefined, max_offers: undefined })}>
            <option value="may">May (once)</option>
            <option value="must">Must (until it lands)</option>
          </select>
        </label>
        <NumberField label={`${name} priority`} value={cue.priority ?? 0} min={-100} max={100} onChange={(priority) => patch({ priority: priority || undefined })} />
        {cue.kind === "reaction" && <NumberField label={`${name} window`} value={cue.window ?? 3} min={1} max={20} onChange={(window) => patch({ window: window === 3 ? undefined : window })} />}
        {must && <NumberField label={`${name} max offers`} value={cue.max_offers ?? 3} min={1} max={5} onChange={(max) => patch({ max_offers: max === 3 ? undefined : max })} />}
        <IconButton icon="fa-xmark" label={`Remove ${name}`} onClick={() => mutate((current) => removeCue(current, member.id, cue.id))} />
      </div>
      <TextField label={`${name} cue`} value={cue.cue} onChange={(text) => patch({ cue: text })} placeholder="the player returned the stolen ledger" />
      {narratesPlayer(cue.cue) && <div data-so="cue-warning" role="note" className="text-xs st-warn">Says what the player does or feels. Name what the character noticed.</div>}
      <span className="text-xs st-muted">{cue.kind === "reaction" ? "Reacts when (an event)" : "Holds while"}</span>
      <GateBuilder gate={cue.when} qualities={qualities} onChange={(when) => patch({ when })} />
      {must && (
        <>
          <span className="text-xs st-muted">Landed when (shows it was said)</span>
          <GateBuilder gate={cue.landed_when ?? { all: [] }} qualities={qualities} onChange={(landed_when) => patch({ landed_when })} />
        </>
      )}
    </div>
  );
};

const TierRow: React.FC<{ label: string; tier: TopicTier; qualities: Quality[]; onChange: (tier: TopicTier) => void; onRemove?: () => void }> = ({ label, tier, qualities, onChange, onRemove }) => (
  <div className="flex flex-col gap-1">
    <div className="flex flex-wrap items-end gap-2">
      <TextField label={`${label} cue`} value={tier.cue} onChange={(cue) => onChange({ ...tier, cue })} />
      {onRemove && <IconButton icon="fa-xmark" label={`Remove ${label}`} onClick={onRemove} />}
    </div>
    <OptionalGate label={`${label} only when`} gate={tier.when} qualities={qualities} onChange={(when) => onChange(clean({ ...tier, when }))} />
  </div>
);

const TopicRow: React.FC<{ member: RosterMember; topic: MemberTopic; qualities: Quality[] }> = ({ member, topic, qualities }) => {
  const mutate = useDraftStore((state) => state.mutate);
  const name = `${member.id} topic ${topic.id}`;
  const patch = (value: Partial<MemberTopic>) => mutate((current) => setTopic(current, member.id, clean({ ...topic, ...value })));
  const setTier = (index: number, tier: TopicTier) => patch({ tiers: topic.tiers.map((entry, at) => (at === index ? tier : entry)) });
  return (
    <div data-so="topic-row" data-member={member.id} className="st-subpanel flex flex-col gap-2 p-2">
      <div className="flex flex-wrap items-end gap-2">
        <span className="st-pill px-2 py-0.5 text-[11px]">{topic.id}</span>
        <TextField label={`${name} keys`} value={topic.keys.join(", ")} placeholder="ledger, the accounts"
          onChange={(text) => patch({ keys: text.split(",").map((key) => key.trim()).filter(Boolean) })} />
        <IconButton icon="fa-xmark" label={`Remove ${name}`} onClick={() => mutate((current) => removeTopic(current, member.id, topic.id))} />
      </div>
      {topic.tiers.map((tier, index) => (
        <TierRow key={index} label={`${name} tier ${index + 1}`} tier={tier} qualities={qualities} onChange={(next) => setTier(index, next)}
          onRemove={topic.tiers.length > 1 ? () => patch({ tiers: topic.tiers.filter((_, at) => at !== index) }) : undefined} />
      ))}
      {topic.tiers.length < 3 && (
        <Button className="self-start" onClick={() => patch({ tiers: [...topic.tiers, { cue: "" }] })}>+ Deeper tier</Button>
      )}
    </div>
  );
};

const CuesEditor: React.FC<{ memberId?: string }> = ({ memberId }) => {
  const cast = useDraftStore((state) => state.draft.roster);
  const roster = memberId ? cast.filter((member) => member.id === memberId) : cast;
  const qualities = useDraftStore((state) => state.draft.qualities);
  const mutate = useDraftStore((state) => state.mutate);
  if (!roster.length) return null;
  const addCue = (member: RosterMember) => mutate((current) => setCue(current, member.id, {
    id: nextId((member.cues ?? []).map((cue) => cue.id), "cue"), kind: "reaction", when: { all: [] }, cue: "",
  }));
  const addTopic = (member: RosterMember) => mutate((current) => setTopic(current, member.id, {
    id: nextId((member.topics ?? []).map((topic) => topic.id), "topic"), keys: [], tiers: [{ cue: "" }],
  }));
  return (
    <div id="so-cues-editor" data-so="cues-editor" className="st-subpanel flex flex-col gap-2 p-3">
      <div className="text-sm font-medium">Cues and topics<HelpTooltip title={HELP} /></div>
      <p className="so-setting-desc">{TOPIC_HELP}</p>
      {roster.map((member) => (
        <div key={member.id} className="flex flex-col gap-2">
          {(member.cues ?? []).map((cue) => <CueRow key={cue.id} member={member} cue={cue} qualities={qualities} />)}
          {(member.topics ?? []).map((topic) => <TopicRow key={topic.id} member={member} topic={topic} qualities={qualities} />)}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => addCue(member)}>+ Cue for {member.name ?? member.id}</Button>
            <Button onClick={() => addTopic(member)}>+ Topic for {member.name ?? member.id}</Button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default CuesEditor;
