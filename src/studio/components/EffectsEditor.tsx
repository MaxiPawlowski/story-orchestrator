import React from "react";
import {
  castMemberNames, isCastMember, NPC_REPLY_KINDS, NPC_REPLY_TRIGGERS, type CheckpointEffects, type NpcReplyEffect, type NpcReplyKind, type NpcReplyTrigger, type RosterMember,
} from "@engine/index";
import MultiSelect from "@components/studio/MultiSelect";
import HelpTooltip from "@components/studio/HelpTooltip";
import type { DeclaredCardField } from "@engine/cardFields";
import { isRecord } from "@utils/guards";
import type { WorkflowMap } from "@engine/schema";
import WorkflowMapEditor, { useWorkflowNames } from "./WorkflowMapEditor";

const readStrings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : []);

interface WorldInfoEntry { lorebook: string; comments: string[] }

const readAuthorNote = (value: unknown): { text: string; inject: boolean; rest: Record<string, unknown> } | null => {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return { text: value, inject: false, rest: {} };
  if (!isRecord(value)) return null;
  const { text, inject_blackboard, include_blackboard, ...rest } = value;
  return { text: typeof text === "string" ? text : "", inject: inject_blackboard === true || include_blackboard === true, rest };
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

const Section: React.FC<{ title: string; enabled: boolean; onToggle: (enabled: boolean) => void; help?: string; children?: React.ReactNode }> = ({ title, enabled, onToggle, help, children }) => (
  <div className="st-subpanel flex flex-col gap-2 p-2">
    <label className="flex items-center gap-2 text-sm font-medium">
      <input type="checkbox" checked={enabled} onChange={(event) => onToggle(event.target.checked)} />
      {title}
      {help ? <HelpTooltip title={help} /> : null}
    </label>
    {enabled ? <div className="flex flex-col gap-2 pl-6">{children}</div> : null}
  </div>
);

const StringListInput: React.FC<{ label: string; values: string[]; onChange: (next: string[]) => void }> = ({ label, values, onChange }) => (
  <div className="flex flex-col gap-1">
    {values.map((value, index) => (
      <div key={index} className="flex items-center gap-2">
        <input
          className="text_pole st-input"
          aria-label={`${label} ${index + 1}`}
          value={value}
          onChange={(event) => onChange(values.map((entry, entryIndex) => (entryIndex === index ? event.target.value : entry)))}
        />
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
          <input
            className="text_pole st-input flex-1"
            aria-label={`${title} lorebook ${index + 1}`}
            placeholder="lorebook"
            value={entry.lorebook}
            onChange={(event) => onChange(entries.map((item, itemIndex) => (itemIndex === index ? { ...item, lorebook: event.target.value } : item)))}
          />
          <button
            type="button"
            className="st-button danger"
            aria-label={`Remove ${title} entry ${index + 1}`}
            onClick={() => onChange(entries.filter((_, itemIndex) => itemIndex !== index))}
          >×</button>
        </div>
        <StringListInput label="comment" values={entry.comments} onChange={(comments) => onChange(entries.map((item, itemIndex) => (itemIndex === index ? { ...item, comments } : item)))} />
      </div>
    ))}
    <button type="button" className="st-button secondary self-start" onClick={() => onChange([...entries, { lorebook: "", comments: [] }])}>+ {title} entry</button>
  </div>
);

const NpcRepliesEditor: React.FC<{ replies: NpcReplyEffect[]; roster: RosterMember[]; onChange: (next: NpcReplyEffect[]) => void }> = ({ replies, roster, onChange }) => {
  const update = (index: number, patch: Partial<NpcReplyEffect>) => onChange(replies.map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...patch } : entry)));
  return (
    <div className="flex flex-col gap-2">
      {replies.map((reply, index) => (
        <div key={index} className="st-subpanel flex flex-col gap-2 p-2">
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Reply trigger"
              className="text_pole st-input"
              value={reply.trigger}
              onChange={(event) => update(index, { trigger: event.target.value as NpcReplyTrigger, ...(event.target.value === "afterSpeak" ? {} : { after_member: undefined }) })}
            >
              {NPC_REPLY_TRIGGERS.map((trigger) => <option key={trigger} value={trigger}>{trigger}</option>)}
            </select>
            <select aria-label="Reply kind" className="text_pole st-input" value={reply.kind} onChange={(event) => update(index, { kind: event.target.value as NpcReplyKind })}>
              {NPC_REPLY_KINDS.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
            </select>
            <input className="text_pole st-input" aria-label="Reply member" placeholder="member" value={reply.member} onChange={(event) => update(index, { member: event.target.value })} />
            <label className="flex items-center gap-1 text-xs st-muted">
              <input
                type="checkbox"
                aria-label={`Reply ${index + 1} enabled`}
                checked={reply.enabled !== false}
                onChange={(event) => update(index, { enabled: event.target.checked ? undefined : false })}
              />
              enabled
            </label>
            <button type="button" className="st-button danger" aria-label={`Remove reply ${index + 1}`} onClick={() => onChange(replies.filter((_, entryIndex) => entryIndex !== index))}>×</button>
          </div>
          {reply.trigger === "afterSpeak" ? (
            <label className="flex items-center gap-2 text-xs st-muted">
              only after
              <select
                aria-label="Reply after member"
                className="text_pole st-input"
                value={reply.after_member ?? ""}
                onChange={(event) => update(index, { after_member: event.target.value || undefined })}
              >
                <option value="">any speaker</option>
                {roster.map((member) => <option key={member.id} value={member.name ?? member.id}>{member.name ?? member.id}</option>)}
              </select>
            </label>
          ) : null}
          {reply.kind === "scripted" ? (
            <textarea
              className="text_pole st-input min-h-[3rem]"
              aria-label="Reply text"
              placeholder="text"
              value={reply.text ?? ""}
              onChange={(event) => update(index, { text: event.target.value })}
            />
          ) : (
            <textarea
              className="text_pole st-input min-h-[3rem]"
              aria-label="Reply instruction"
              placeholder="instruction"
              value={reply.instruction ?? ""}
              onChange={(event) => update(index, { instruction: event.target.value })}
            />
          )}
        </div>
      ))}
      <button type="button" className="st-button secondary self-start" onClick={() => onChange([...replies, { trigger: "onEnter", member: "", kind: "scripted" }])}>+ NPC reply</button>
    </div>
  );
};

const CastSide: React.FC<{ label: string; names: string[]; roster: RosterMember[]; castable: RosterMember[]; onChange: (next: string[]) => void }> = ({
  label, names, roster, castable, onChange,
}) => {
  const value = castMemberNames(roster, names);
  const unresolved = value.filter((name) => !isCastMember(castable, name));
  const options = castable.map((member) => ({ value: member.name ?? member.id, label: member.name ?? member.id }));
  return (
    <>
      <span className="text-xs st-muted">{label}</span>
      <MultiSelect label={label} options={options} value={value} onChange={onChange} />
      {unresolved.length > 0 && (
        <div data-so="cast-unresolved" className="st-alert-error flex flex-wrap items-center gap-2 rounded px-2 py-1 text-xs">
          <span>Not a cast member, so this changes nobody: {unresolved.join(", ")}</span>
          <button type="button" className="st-button secondary px-2 py-0.5 text-[11px]" onClick={() => onChange(value.filter((name) => !unresolved.includes(name)))}>Remove</button>
        </div>
      )}
    </>
  );
};

const WORKFLOW_HELP = "From this turning point on, these picture types use the named ComfyUI workflows (SillyTavern's ComfyUI source only). "
  + "Later turning points without one keep it; the last one on the path wins.";

const CheckpointWorkflows: React.FC<{ effects: CheckpointEffects; emit: (next: CheckpointEffects) => void }> = ({ effects, emit }) => {
  const names = useWorkflowNames();
  const change = (workflows: WorkflowMap | undefined) => emit({ ...effects, illustrations: { ...(workflows ? { workflows } : {}) } });
  return <Section title="Picture workflows" help={WORKFLOW_HELP} enabled={effects.illustrations !== undefined}
    onToggle={(on) => emit({ ...effects, illustrations: on ? {} : undefined })}>
    <WorkflowMapEditor value={effects.illustrations?.workflows} names={names} inherited="Story default" onChange={change} />
  </Section>;
};

const EffectsEditor: React.FC<{
  effects: CheckpointEffects;
  roster: RosterMember[];
  castable?: RosterMember[];
  backgroundNames?: string[];
  cardFields?: DeclaredCardField[];
  onChange: (next: CheckpointEffects) => void;
}> = ({ effects, roster, castable = roster, backgroundNames = [], cardFields = [], onChange }) => {
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
  const card = isRecord(effects.card) ? (effects.card as Record<string, Record<string, string>>) : undefined;
  const ownerLabel = (owner: string) => (owner === "player" ? "You" : roster.find((member) => member.id === owner)?.name ?? owner);
  const setCardValue = (owner: string, field: string, value: string) => {
    const next = { ...(card ?? {}) };
    const values = { ...(next[owner] ?? {}) };
    if (value.trim()) values[field] = value; else delete values[field];
    if (Object.keys(values).length) next[owner] = values; else delete next[owner];
    emit({ ...effects, card: Object.keys(next).length ? next : undefined });
  };

  return (
    <div className="flex flex-col gap-2">
      <Section title="Author note" enabled={authorNote !== null} onToggle={(on) => emit({ ...effects, author_note: on ? { text: "" } : undefined })}>
        {authorNote ? (
          <>
            <textarea
              className="text_pole st-input min-h-[3rem]"
              aria-label="Author note text"
              value={authorNote.text}
              onChange={(event) => emit({ ...effects, author_note: { ...authorNote.rest, text: event.target.value, ...(authorNote.inject ? { inject_blackboard: true } : {}) } })}
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={authorNote.inject}
                onChange={(event) => emit({ ...effects, author_note: { ...authorNote.rest, text: authorNote.text, ...(event.target.checked ? { inject_blackboard: true } : {}) } })}
              />
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
        <p
          data-so="preset-overlay-note"
          className="text-xs st-muted"
        >Applies this preset's samplers to this checkpoint's replies only; your selected preset is untouched. The name must match a preset of the connection's API exactly.</p>
      </Section>

      <Section
        title="Background"
        help="Switches the SillyTavern background when the story enters this checkpoint. Partial filenames match, and re-entering or reloading re-applies the same background without side effects."
        enabled={effects.background !== undefined}
        onToggle={(on) => emit({ ...effects, background: on ? { name: backgroundNames[0] ?? "" } : undefined })}
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs st-muted">Background file</span>
          <input
            className="text_pole st-input"
            aria-label="Background file"
            list="so-effect-backgrounds"
            value={effects.background?.name ?? ""}
            onChange={(event) => emit({ ...effects, background: { name: event.target.value } })}
          />
          <datalist id="so-effect-backgrounds">
            {backgroundNames.map((name) => <option key={name} value={name} />)}
          </datalist>
        </label>
      </Section>

      <CheckpointWorkflows effects={effects} emit={emit} />

      <Section
        title="Scenario"
        help={"Replaces the chat's scenario text from this checkpoint on, in place of every member card's own scenario. Later checkpoints without one keep it. "
          + "Leave the text empty to clear the scenario here. Framing only: genre, place, the arc's name; never a secret or a twist."}
        enabled={effects.scenario !== undefined}
        onToggle={(on) => emit({ ...effects, scenario: on ? "" : undefined })}
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs st-muted">Scenario text</span>
          <textarea
            className="text_pole st-input min-h-[3rem]"
            aria-label="Scenario text"
            value={effects.scenario ?? ""}
            onChange={(event) => emit({ ...effects, scenario: event.target.value })}
          />
        </label>
        {(effects.scenario ?? "").trim() ? null : <p data-so="scenario-clear-note" className="text-xs st-muted">Empty: this checkpoint clears the chat&apos;s scenario.</p>}
      </Section>

      <Section title="Cast changes" enabled={cast !== undefined} onToggle={(on) => emit({ ...effects, cast_changes: on ? { enable: [], disable: [] } : undefined })}>
        <CastSide label="Enable members" names={castEnable} roster={roster} castable={castable}
          onChange={(enable) => emit({ ...effects, cast_changes: { enable, disable: castMemberNames(roster, castDisable) } })} />
        <CastSide label="Disable members" names={castDisable} roster={roster} castable={castable}
          onChange={(disable) => emit({ ...effects, cast_changes: { enable: castMemberNames(roster, castEnable), disable } })} />
      </Section>

      <Section title="World info" enabled={worldInfo !== undefined} onToggle={(on) => emit({ ...effects, world_info: on ? { enable: [], disable: [] } : undefined })}>
        <WorldInfoList title="enable" entries={readWorldInfoEntries(worldInfo?.enable)} onChange={(enable) => emit({ ...effects, world_info: { ...worldInfo, enable } })} />
        <WorldInfoList title="disable" entries={readWorldInfoEntries(worldInfo?.disable)} onChange={(disable) => emit({ ...effects, world_info: { ...worldInfo, disable } })} />
      </Section>

      <Section
        title="Card changes"
        help={"Rewrites a character's card field for play from this checkpoint on, e.g. after a transformation. Only fields declared in the Roster tab appear, " +
          "and an empty value leaves the field unchanged."}
        enabled={card !== undefined}
        onToggle={(on) => emit({ ...effects, card: on ? {} : undefined })}
      >
        {cardFields.length === 0 ? <p className="text-xs st-muted">Declare a card field in the Roster tab first.</p> : cardFields.map(({ owner, field, quality }) => (
          <label key={`${owner}:${field}`} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-xs st-muted">{ownerLabel(owner)} · {field}</span>
            {quality.type === "enum" && quality.values?.length ? (
              <select className="text_pole st-input" aria-label={`${ownerLabel(owner)} ${field}`} value={card?.[owner]?.[field] ?? ""}
                onChange={(event) => setCardValue(owner, field, event.target.value)}>
                <option value="">no change</option>
                {quality.values.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            ) : (
              <input className="text_pole st-input" aria-label={`${ownerLabel(owner)} ${field}`} placeholder="value" value={card?.[owner]?.[field] ?? ""}
                onChange={(event) => setCardValue(owner, field, event.target.value)} />
            )}
          </label>
        ))}
      </Section>

      <Section
        title="NPC replies"
        help={"Forces a group member to reply when the checkpoint is entered or after someone speaks: scripted posts a fixed line, generated triggers a real reply. 'Only after' " +
          "restricts afterSpeak replies to one speaker; unchecking Enabled keeps the entry but skips it."}
        enabled={Array.isArray(effects.npc_replies) && effects.npc_replies.length > 0}
        onToggle={(on) => emit({ ...effects, npc_replies: on ? [{ trigger: "onEnter", member: "", kind: "scripted" }] : undefined })}
      >
        <NpcRepliesEditor replies={effects.npc_replies ?? []} roster={roster} onChange={(npc_replies) => emit({ ...effects, npc_replies })} />
      </Section>
    </div>
  );
};

export default EffectsEditor;
