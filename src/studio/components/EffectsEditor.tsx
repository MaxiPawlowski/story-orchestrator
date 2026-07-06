import React from "react";
import { NPC_REPLY_KINDS, NPC_REPLY_TRIGGERS, type CheckpointEffects, type NpcReplyEffect, type NpcReplyKind, type NpcReplyTrigger, type RosterMember } from "@engine/index";
import MultiSelect from "@components/studio/MultiSelect";

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const readStrings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : []);

interface WorldInfoEntry { lorebook: string; comments: string[] }

const readAuthorNote = (value: unknown): { text: string; inject: boolean } | null => {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return { text: value, inject: false };
  if (isRecord(value)) return { text: typeof value.text === "string" ? value.text : "", inject: value.inject_blackboard === true || value.include_blackboard === true };
  return null;
};

const readPresetName = (value: unknown): string | null => {
  if (value === undefined) return null;
  if (typeof value === "string") return value;
  if (isRecord(value) && typeof value.name === "string") return value.name;
  return "";
};

const readWorldInfoEntries = (value: unknown): WorldInfoEntry[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!isRecord(entry)) return null;
      const lorebook = typeof entry.lorebook === "string" ? entry.lorebook : typeof entry.book === "string" ? entry.book : "";
      const comments = Array.isArray(entry.comments) ? entry.comments.filter((item): item is string => typeof item === "string") : typeof entry.comment === "string" ? [entry.comment] : [];
      return { lorebook, comments };
    })
    .filter((entry): entry is WorldInfoEntry => entry !== null);
};

const Section: React.FC<{ title: string; enabled: boolean; onToggle: (enabled: boolean) => void; children?: React.ReactNode }> = ({ title, enabled, onToggle, children }) => (
  <div className="st-subpanel flex flex-col gap-2 p-2">
    <label className="flex items-center gap-2 text-sm font-medium">
      <input type="checkbox" checked={enabled} onChange={(event) => onToggle(event.target.checked)} />
      {title}
    </label>
    {enabled ? <div className="flex flex-col gap-2 pl-6">{children}</div> : null}
  </div>
);

const StringListInput: React.FC<{ label: string; values: string[]; onChange: (next: string[]) => void }> = ({ label, values, onChange }) => (
  <div className="flex flex-col gap-1">
    {values.map((value, index) => (
      <div key={index} className="flex items-center gap-2">
        <input className="text_pole st-input" aria-label={`${label} ${index + 1}`} value={value} onChange={(event) => onChange(values.map((entry, entryIndex) => (entryIndex === index ? event.target.value : entry)))} />
        <button type="button" className="st-button danger" aria-label={`Remove ${label} ${index + 1}`} onClick={() => onChange(values.filter((_, entryIndex) => entryIndex !== index))}>×</button>
      </div>
    ))}
    <button type="button" className="st-button secondary self-start" onClick={() => onChange([...values, ""])}>+ {label}</button>
  </div>
);

const WorldInfoList: React.FC<{ title: string; entries: WorldInfoEntry[]; onChange: (next: WorldInfoEntry[]) => void }> = ({ title, entries, onChange }) => (
  <div className="flex flex-col gap-2">
    <span className="text-xs st-muted">{title}</span>
    {entries.map((entry, index) => (
      <div key={index} className="st-subpanel flex flex-col gap-2 p-2">
        <div className="flex items-center gap-2">
          <input className="text_pole st-input flex-1" aria-label={`${title} lorebook ${index + 1}`} placeholder="lorebook" value={entry.lorebook} onChange={(event) => onChange(entries.map((item, itemIndex) => (itemIndex === index ? { ...item, lorebook: event.target.value } : item)))} />
          <button type="button" className="st-button danger" aria-label={`Remove ${title} entry ${index + 1}`} onClick={() => onChange(entries.filter((_, itemIndex) => itemIndex !== index))}>×</button>
        </div>
        <StringListInput label="comment" values={entry.comments} onChange={(comments) => onChange(entries.map((item, itemIndex) => (itemIndex === index ? { ...item, comments } : item)))} />
      </div>
    ))}
    <button type="button" className="st-button secondary self-start" onClick={() => onChange([...entries, { lorebook: "", comments: [] }])}>+ {title} entry</button>
  </div>
);

const NpcRepliesEditor: React.FC<{ replies: NpcReplyEffect[]; onChange: (next: NpcReplyEffect[]) => void }> = ({ replies, onChange }) => {
  const update = (index: number, patch: Partial<NpcReplyEffect>) => onChange(replies.map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...patch } : entry)));
  return (
    <div className="flex flex-col gap-2">
      {replies.map((reply, index) => (
        <div key={index} className="st-subpanel flex flex-col gap-2 p-2">
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label="Reply trigger" className="text_pole st-input" value={reply.trigger} onChange={(event) => update(index, { trigger: event.target.value as NpcReplyTrigger })}>
              {NPC_REPLY_TRIGGERS.map((trigger) => <option key={trigger} value={trigger}>{trigger}</option>)}
            </select>
            <select aria-label="Reply kind" className="text_pole st-input" value={reply.kind} onChange={(event) => update(index, { kind: event.target.value as NpcReplyKind })}>
              {NPC_REPLY_KINDS.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
            </select>
            <input className="text_pole st-input" aria-label="Reply member" placeholder="member" value={reply.member} onChange={(event) => update(index, { member: event.target.value })} />
            <button type="button" className="st-button danger" aria-label={`Remove reply ${index + 1}`} onClick={() => onChange(replies.filter((_, entryIndex) => entryIndex !== index))}>×</button>
          </div>
          {reply.kind === "scripted" ? (
            <textarea className="text_pole st-input min-h-[3rem]" aria-label="Reply text" placeholder="text" value={reply.text ?? ""} onChange={(event) => update(index, { text: event.target.value })} />
          ) : (
            <textarea className="text_pole st-input min-h-[3rem]" aria-label="Reply instruction" placeholder="instruction" value={reply.instruction ?? ""} onChange={(event) => update(index, { instruction: event.target.value })} />
          )}
        </div>
      ))}
      <button type="button" className="st-button secondary self-start" onClick={() => onChange([...replies, { trigger: "onEnter", member: "", kind: "scripted" }])}>+ NPC reply</button>
    </div>
  );
};

const EffectsEditor: React.FC<{ effects: CheckpointEffects; roster: RosterMember[]; onChange: (next: CheckpointEffects) => void }> = ({ effects, roster, onChange }) => {
  const emit = (next: CheckpointEffects) => {
    const cleaned: CheckpointEffects = { ...next };
    (Object.keys(cleaned) as Array<keyof CheckpointEffects>).forEach((key) => {
      if (cleaned[key] === undefined) delete cleaned[key];
    });
    onChange(cleaned);
  };

  const authorNote = readAuthorNote(effects.author_note);
  const presetName = readPresetName(effects.preset);
  const cast = isRecord(effects.cast_changes) ? effects.cast_changes : undefined;
  const castEnable = readStrings(cast?.enable);
  const castDisable = readStrings(cast?.disable);
  const worldInfo = isRecord(effects.world_info) ? effects.world_info : undefined;
  const rosterOptions = roster.map((member) => ({ value: member.name ?? member.id, label: member.name ?? member.id }));

  return (
    <div className="flex flex-col gap-2">
      <Section title="Author note" enabled={authorNote !== null} onToggle={(on) => emit({ ...effects, author_note: on ? { text: "" } : undefined })}>
        {authorNote ? (
          <>
            <textarea className="text_pole st-input min-h-[3rem]" aria-label="Author note text" value={authorNote.text} onChange={(event) => emit({ ...effects, author_note: { text: event.target.value, ...(authorNote.inject ? { inject_blackboard: true } : {}) } })} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={authorNote.inject} onChange={(event) => emit({ ...effects, author_note: { text: authorNote.text, ...(event.target.checked ? { inject_blackboard: true } : {}) } })} />
              Inject blackboard
            </label>
          </>
        ) : null}
      </Section>

      <Section title="Preset" enabled={presetName !== null} onToggle={(on) => emit({ ...effects, preset: on ? "" : undefined })}>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs st-muted">Preset name</span>
          <input className="text_pole st-input" value={presetName ?? ""} onChange={(event) => emit({ ...effects, preset: event.target.value })} />
        </label>
      </Section>

      <Section title="Cast changes" enabled={cast !== undefined} onToggle={(on) => emit({ ...effects, cast_changes: on ? { enable: [], disable: [] } : undefined })}>
        <span className="text-xs st-muted">Enable members</span>
        <MultiSelect options={rosterOptions} value={castEnable} onChange={(enable) => emit({ ...effects, cast_changes: { enable, disable: castDisable } })} />
        <span className="text-xs st-muted">Disable members</span>
        <MultiSelect options={rosterOptions} value={castDisable} onChange={(disable) => emit({ ...effects, cast_changes: { enable: castEnable, disable } })} />
      </Section>

      <Section title="World info" enabled={worldInfo !== undefined} onToggle={(on) => emit({ ...effects, world_info: on ? { enable: [], disable: [] } : undefined })}>
        <WorldInfoList title="enable" entries={readWorldInfoEntries(worldInfo?.enable)} onChange={(enable) => emit({ ...effects, world_info: { ...worldInfo, enable } })} />
        <WorldInfoList title="disable" entries={readWorldInfoEntries(worldInfo?.disable)} onChange={(disable) => emit({ ...effects, world_info: { ...worldInfo, disable } })} />
      </Section>

      <Section title="NPC replies" enabled={Array.isArray(effects.npc_replies) && effects.npc_replies.length > 0} onToggle={(on) => emit({ ...effects, npc_replies: on ? [{ trigger: "onEnter", member: "", kind: "scripted" }] : undefined })}>
        <NpcRepliesEditor replies={effects.npc_replies ?? []} onChange={(npc_replies) => emit({ ...effects, npc_replies })} />
      </Section>
    </div>
  );
};

export default EffectsEditor;
