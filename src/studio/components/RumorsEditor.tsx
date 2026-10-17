import React from "react";
import type { RosterMember } from "@engine/index";
import { RUMOR_TRUTHS, type Rumor, type RumorTruth, type RumorVersion } from "@engine/rumorSchema";
import HelpTooltip from "@components/studio/HelpTooltip";
import { useDraftStore } from "../draft";
import { addRumor, removeRumor, setMemberGossip, updateRumor } from "../gameMutations";
import { JsonField, OptionalGate, TextField } from "./GameFields";

const HELP = "A rumor starts with one character and travels along the gossip channels you give members, after a delay, as hearsay: the receiver is told who said it "
  + "and whether they believe it, never whether it is true. No model call. A rumor never carries a secret kept from someone, except to the member a leak names.";
const LEAKS_HINT = '[{"member": "tam", "when": {"q": "confessed", "op": "==", "v": true}}]';

const toInt = (text: string, fallback: number) => (Number.isInteger(Number(text)) && text.trim() ? Number(text) : fallback);

type Gossip = { talks_to?: string[]; contact?: unknown; delay?: { boundaries?: [number, number]; days?: [number, number] }; hops?: number; when?: unknown };

const VersionRow = ({ rumor, version, at }: { rumor: Rumor; version: RumorVersion; at: number }) => {
  const mutate = useDraftStore((state) => state.mutate);
  const versions = rumor.versions ?? [];
  const patch = (value: Partial<RumorVersion>) => mutate((current) => updateRumor(current, rumor.id, {
    versions: versions.map((entry, index) => (index === at ? { ...entry, ...value } : entry)),
  }));
  return (
    <div data-so="rumor-version-row" className="flex flex-wrap items-end gap-2">
      <TextField label={`${rumor.id} version ${at + 1}`} value={version.text} onChange={(text) => patch({ text })} />
      <TextField label={`${rumor.id} version ${at + 1} weight`} value={String(version.weight)} onChange={(weight) => patch({ weight: toInt(weight, version.weight) })} />
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs st-muted">True? (only you see this)</span>
        <select className="text_pole st-input" aria-label={`${rumor.id} version ${at + 1} truth`} value={version.truth}
          onChange={(event) => patch({ truth: event.target.value as RumorTruth })}>
          {RUMOR_TRUTHS.map((truth) => <option key={truth} value={truth}>{truth}</option>)}
        </select>
      </label>
      <button type="button" className="st-button danger" aria-label={`Remove ${rumor.id} version ${at + 1}`}
        onClick={() => mutate((current) => updateRumor(current, rumor.id, { versions: versions.filter((_, index) => index !== at) }))}>×</button>
    </div>
  );
};

const RumorRow = ({ rumor, roster }: { rumor: Rumor; roster: RosterMember[] }) => {
  const mutate = useDraftStore((state) => state.mutate);
  const qualities = useDraftStore((state) => state.draft.qualities);
  const patch = (value: Partial<Omit<Rumor, "id">>) => mutate((current) => updateRumor(current, rumor.id, value));
  return (
    <div data-so="rumor-editor-row" data-rumor={rumor.id} className="st-subpanel flex flex-col gap-2 p-2">
      <div className="flex flex-wrap items-end gap-2">
        <span className="st-pill px-2 py-0.5 text-[11px]">{rumor.id}</span>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs st-muted">Starts with</span>
          <select className="text_pole st-input" aria-label={`${rumor.id} starts with`} value={rumor.from} onChange={(event) => patch({ from: event.target.value })}>
            {roster.map((member) => <option key={member.id} value={member.id}>{member.name || member.id}</option>)}
          </select>
        </label>
        <TextField label={`${rumor.id} claim`} value={rumor.claim} onChange={(claim) => patch({ claim })} />
        <button type="button" className="st-button danger" aria-label={`Remove rumor ${rumor.id}`} onClick={() => mutate((current) => removeRumor(current, rumor.id))}>×</button>
      </div>
      <OptionalGate label={`${rumor.id} starts only when`} gate={rumor.starts_when} qualities={qualities} onChange={(starts_when) => patch({ starts_when })} />
      {(rumor.versions ?? []).map((version, at) => <VersionRow key={at} rumor={rumor} version={version} at={at} />)}
      <button type="button" className="st-button secondary self-start"
        onClick={() => patch({ versions: [...(rumor.versions ?? []), { text: rumor.claim, truth: "unknown", weight: 1 }] })}>+ Version</button>
      <JsonField label={`${rumor.id} leaks`} hint={LEAKS_HINT} value={rumor.leaks_to}
        onChange={(leaks) => patch({ leaks_to: Array.isArray(leaks) ? leaks as Rumor["leaks_to"] : undefined })} />
    </div>
  );
};

const GossipRow = ({ member, roster }: { member: RosterMember; roster: RosterMember[] }) => {
  const mutate = useDraftStore((state) => state.mutate);
  const gossip = member.gossip as Gossip | undefined;
  const write = (next: Gossip | undefined) => mutate((current) => setMemberGossip(current, member.id, next as Record<string, unknown> | undefined));
  const talks = gossip?.talks_to ?? [];
  const delay = gossip?.delay?.boundaries ?? [1, 3];
  return (
    <div data-so="gossip-row" data-member={member.id} className="flex flex-col gap-1 text-sm">
      <fieldset className="flex flex-wrap gap-2" aria-label={`${member.id} passes news to`}>
        <span className="text-xs st-muted">{member.name || member.id} passes news to</span>
        {roster.filter((other) => other.id !== member.id).map((other) => (
          <label key={other.id} className="flex items-center gap-1">
            <input type="checkbox" aria-label={`${member.id} talks to ${other.id}`} checked={talks.includes(other.id)}
              onChange={(event) => {
                const next = event.target.checked ? [...talks, other.id] : talks.filter((id) => id !== other.id);
                write(next.length ? { ...gossip, talks_to: next } : undefined);
              }} />
            {other.name || other.id}
          </label>
        ))}
      </fieldset>
      {talks.length > 0 && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs st-muted">Reaches them</span>
            <select className="text_pole st-input" aria-label={`${member.id} contact`} value={gossip?.contact === "any" ? "any" : "together"}
              onChange={(event) => write({ ...gossip, talks_to: talks, contact: event.target.value })}>
              <option value="together">when both are in the same place</option>
              <option value="any">anywhere (letters, messengers)</option>
            </select>
          </label>
          <TextField label={`${member.id} delay from`} value={String(delay[0])}
            onChange={(value) => write({ ...gossip, talks_to: talks, delay: { boundaries: [toInt(value, delay[0]), delay[1]] } })} />
          <TextField label={`${member.id} delay to`} value={String(delay[1])}
            onChange={(value) => write({ ...gossip, talks_to: talks, delay: { boundaries: [delay[0], toInt(value, delay[1])] } })} />
          <TextField label={`${member.id} hops`} value={String(gossip?.hops ?? 2)} onChange={(value) => write({ ...gossip, talks_to: talks, hops: toInt(value, gossip?.hops ?? 2) })} />
        </div>
      )}
    </div>
  );
};

const RumorsEditor: React.FC = () => {
  const rumors = useDraftStore((state) => state.draft.rumors) ?? [];
  const roster = useDraftStore((state) => state.draft.roster);
  const mutate = useDraftStore((state) => state.mutate);
  return (
    <div data-so="rumors-editor" className="st-subpanel flex flex-col gap-2 p-3">
      <div className="text-sm font-medium">Rumors and gossip<HelpTooltip title={HELP} /></div>
      {rumors.map((rumor) => <RumorRow key={rumor.id} rumor={rumor} roster={roster} />)}
      <button type="button" className="st-button secondary self-start" disabled={!roster.length} onClick={() => mutate((current) => addRumor(current))}>+ Rumor</button>
      <div data-so="gossip-editor" className="flex flex-col gap-2">
        <span className="text-xs st-muted">Who passes news to whom</span>
        {roster.map((member) => <GossipRow key={member.id} member={member} roster={roster} />)}
      </div>
    </div>
  );
};

export default RumorsEditor;
