import React from "react";
import { ARC_TEMPLATE_NAMES, type ArcTemplateName, type StoryRequirements } from "@engine/index";
import HelpTooltip from "@components/studio/HelpTooltip";
import { useDraftStore } from "../draft";
import { addArcBridge, removeArcBridge, setArcTemplate, setRequirements, setStagecraft, setStoryField, setStoryId, slugifyStoryId, updateArcBridge } from "../mutations";

export interface StoryEditorProps {
  personaNames?: string[];
  memberNames?: string[];
  lorebookNames?: string[];
  // Once a story is in the library its id is what every chat keys its progress by, so it stops
  // being editable there (spec addendum §Story identity).
  idLocked?: boolean;
}

const ARC_TEMPLATE_LABELS: Record<ArcTemplateName, string> = {
  rising: "Rising to climax",
  fall_recovery: "Fall then recovery",
  three_act: "Three act",
};

const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <label className="flex flex-col gap-1 text-sm">
    <span className="text-xs st-muted">{label}{hint ? <HelpTooltip title={hint} /> : null}</span>
    {children}
  </label>
);

const RequirementList: React.FC<{
  label: string;
  hint: string;
  values: string[];
  options: string[];
  listId: string;
  onChange: (next: string[]) => void;
}> = ({ label, hint, values, options, listId, onChange }) => (
  <div className="flex flex-col gap-1">
    <span className="text-xs st-muted">{label}<HelpTooltip title={hint} /></span>
    {values.map((value, index) => (
      <div key={index} className="flex items-center gap-2">
        <input
          className="text_pole st-input flex-1"
          aria-label={`${label} ${index + 1}`}
          list={listId}
          value={value}
          onChange={(event) => onChange(values.map((entry, entryIndex) => (entryIndex === index ? event.target.value : entry)))}
        />
        <button type="button" className="st-button danger" aria-label={`Remove ${label} ${index + 1}`} onClick={() => onChange(values.filter((_, entryIndex) => entryIndex !== index))}>×</button>
      </div>
    ))}
    <button type="button" className="st-button secondary self-start" onClick={() => onChange([...values, options[0] ?? ""])}>+ {label}</button>
    <datalist id={listId}>
      {options.map((option) => <option key={option} value={option} />)}
    </datalist>
  </div>
);

const StoryEditor: React.FC<StoryEditorProps> = ({ personaNames = [], memberNames = [], lorebookNames = [], idLocked = false }) => {
  const draft = useDraftStore((state) => state.draft);
  const mutate = useDraftStore((state) => state.mutate);
  const anchors = draft.checkpoints.filter((checkpoint) => checkpoint.type === "anchor");
  const bridges = draft.arc_bridges ?? [];
  const requirements: StoryRequirements = draft.requirements ?? {};
  const customTemplate = typeof draft.arc_template === "object";

  const patchRequirements = (patch: StoryRequirements) => mutate((current) => setRequirements(current, { ...(current.requirements ?? {}), ...patch }));

  return (
    <div data-so="story" className="flex flex-col gap-4">
      <div className="st-subpanel flex flex-col gap-3 p-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Story id" hint="The stable identity of this story. Chats key their progress by it, so it is fixed once the story is in the library — editing the title afterwards never forks a new record.">
            <div className="flex items-center gap-2">
              <input
                className="text_pole st-input flex-1"
                aria-label="Story id"
                disabled={idLocked}
                placeholder={slugifyStoryId(draft.title)}
                value={draft.id ?? ""}
                onChange={(event) => mutate((current) => setStoryId(current, event.target.value))}
              />
              {!idLocked && !draft.id ? (
                <button type="button" className="st-button secondary" onClick={() => mutate((current) => setStoryId(current, slugifyStoryId(current.title)))}>From title</button>
              ) : null}
            </div>
          </Field>
          <Field label="Version" hint="Bumps automatically when you save changed content under the same id. Chats keep playing the version they pinned until you apply the update from that chat.">
            <input className="text_pole st-input" aria-label="Story version" readOnly value={draft.version ?? 1} />
          </Field>
        </div>
        <Field label="Description" hint="Shown in the library and to the player in the drawer header. One or two sentences of premise.">
          <textarea
            className="text_pole st-input min-h-[4rem]"
            aria-label="Story description"
            value={draft.description}
            onChange={(event) => mutate((current) => setStoryField(current, "description", event.target.value))}
          />
        </Field>
        <Field label="Dramatic shape" hint="The tension curve the pacing hint steers toward across the story's anchors. A checkpoint's own tension_target always wins over the shape.">
          <select
            className="text_pole st-input"
            aria-label="Dramatic shape"
            disabled={customTemplate}
            value={customTemplate ? "" : (draft.arc_template as ArcTemplateName | undefined) ?? ""}
            onChange={(event) => mutate((current) => setArcTemplate(current, ARC_TEMPLATE_NAMES.includes(event.target.value as ArcTemplateName) ? (event.target.value as ArcTemplateName) : undefined))}
          >
            <option value="">— none —</option>
            {ARC_TEMPLATE_NAMES.map((name) => <option key={name} value={name}>{ARC_TEMPLATE_LABELS[name]}</option>)}
          </select>
        </Field>
        {customTemplate ? <div className="text-xs st-muted">This story carries a custom tension curve; edit it in the JSON export.</div> : null}
      </div>

      <div data-so="requirements" className="st-subpanel flex flex-col gap-3 p-3">
        <div className="text-sm font-medium">Requirements <span className="st-muted font-normal">— what the chat must have before the story runs</span></div>
        <RequirementList label="Persona" hint="The user persona this story is written for. A mismatch shows the player a 'this story still needs' notice instead of silently misfiring." values={requirements.personas ?? []} options={personaNames} listId="so-req-personas" onChange={(personas) => patchRequirements({ personas })} />
        <RequirementList label="Cast member" hint="Characters that must be in the group. Names must match the character cards." values={requirements.members ?? []} options={memberNames} listId="so-req-members" onChange={(members) => patchRequirements({ members })} />
        <RequirementList label="Lorebook" hint="Global lorebooks that must be active — the world_info effects assume their entries exist." values={requirements.lorebooks ?? []} options={lorebookNames} listId="so-req-lorebooks" onChange={(lorebooks) => patchRequirements({ lorebooks })} />
      </div>

      <div data-so="stagecraft" className="st-subpanel flex flex-col gap-3 p-3">
        <div className="text-sm font-medium">Stagecraft <span className="st-muted font-normal">— what a background curator may edit</span></div>
        <RequirementList
          label="Curator lorebook"
          hint="The only lorebooks the World Info curator may ever write into. Leave empty and it can write nothing at all — never list a book you keep for yourself."
          values={draft.stagecraft?.lorebooks ?? []}
          options={lorebookNames}
          listId="so-stagecraft-lorebooks"
          onChange={(lorebooks) => mutate((current) => setStagecraft(current, { lorebooks }))}
        />
      </div>

      <div data-so="arc-bridges" className="st-subpanel flex flex-col gap-2 p-3">
        <div className="text-sm font-medium">Thread bridges <span className="st-muted font-normal">— resolved story threads that feed convergence</span></div>
        {bridges.length === 0 ? <div className="text-xs st-muted">None. Add one to have a resolved thread whose text matches the keyword push progress toward an anchor.</div> : null}
        {bridges.map((bridge, index) => (
          <div key={index} className="flex flex-wrap items-end gap-2">
            <label className="flex flex-1 flex-col gap-1 text-sm">
              <span className="text-xs st-muted">Thread keyword</span>
              <input className="text_pole st-input" aria-label={`Bridge ${index + 1} keyword`} value={bridge.arcMatch} onChange={(event) => mutate((current) => updateArcBridge(current, index, { arcMatch: event.target.value }))} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs st-muted">Anchor</span>
              <select className="text_pole st-input" aria-label={`Bridge ${index + 1} anchor`} value={bridge.anchor} onChange={(event) => mutate((current) => updateArcBridge(current, index, { anchor: event.target.value }))}>
                <option value="" disabled>anchor…</option>
                {anchors.map((anchor) => <option key={anchor.id} value={anchor.id}>{anchor.name}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs st-muted">Progress</span>
              <input type="number" step={0.5} className="text_pole st-input w-24" aria-label={`Bridge ${index + 1} amount`} value={bridge.amount} onChange={(event) => mutate((current) => updateArcBridge(current, index, { amount: Number(event.target.value) || 0 }))} />
            </label>
            <button type="button" className="st-button danger" aria-label={`Remove bridge ${index + 1}`} onClick={() => mutate((current) => removeArcBridge(current, index))}>×</button>
          </div>
        ))}
        <button type="button" className="st-button secondary self-start" disabled={!anchors.length} onClick={() => mutate((current) => addArcBridge(current))}>+ Bridge</button>
      </div>
    </div>
  );
};

export default StoryEditor;
