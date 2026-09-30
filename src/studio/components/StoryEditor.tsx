import React from "react";
import { ARC_TEMPLATE_NAMES, HOUSE_RULES_MAX, type ArcTemplateName, type StoryRequirements } from "@engine/index";
import HelpTooltip from "@components/studio/HelpTooltip";
import ChaptersEditor from "./ChaptersEditor";
import { useDraftStore } from "../draft";
import { slugifyStoryId } from "@engine/index";
import { addArcBridge, removeArcBridge, setArcTemplate, setHouseRules, setLoreSelect, setRequirements, setSceneRead, setStagecraft, setStoryField, setStoryId, updateArcBridge } from "../mutations";

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
  <div className="flex flex-col gap-1 text-sm">
    <span className="text-xs st-muted">{label}{hint ? <HelpTooltip title={hint} /> : null}</span>
    {children}
  </div>
);

const RequirementList: React.FC<{
  label: string;
  hint: string;
  values: string[];
  options: string[];
  listId: string;
  max?: number;
  onChange: (next: string[]) => void;
}> = ({ label, hint, values, options, listId, max, onChange }) => (
  <div className="flex flex-col gap-1">
    <span className="text-xs st-muted">{label}<HelpTooltip title={hint} />{max !== undefined ? <span data-so="list-count"> {values.length}/{max}</span> : null}</span>
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
    <button type="button" className="st-button secondary self-start" disabled={max !== undefined && values.length >= max} onClick={() => onChange([...values, options[0] ?? ""])}>+ {label}</button>
    <datalist id={listId}>
      {options.map((option) => <option key={option} value={option} />)}
    </datalist>
  </div>
);

type Draft = ReturnType<typeof useDraftStore.getState>["draft"];
type Mutate = ReturnType<typeof useDraftStore.getState>["mutate"];

const StoryIdentitySection = ({ draft, mutate, idLocked }: { draft: Draft; mutate: Mutate; idLocked: boolean }) => {
  const customTemplate = typeof draft.arc_template === "object";
  return (
    <div className="st-subpanel flex flex-col gap-3 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Story id"
          hint="The stable identity of this story. Chats key their progress by it, so it is fixed once the story is in the library — editing the title afterwards never forks a new record."
        >
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
      <Field label="Library description" hint="Existing stories use this as their public introduction. Keep it spoiler-safe; the Player introduction below replaces it in the drawer and recap.">
        <textarea
          className="text_pole st-input min-h-[4rem]"
          aria-label="Story description"
          value={draft.description}
          onChange={(event) => mutate((current) => setStoryField(current, "description", event.target.value))}
        />
      </Field>
      <Field label="Player introduction" hint="Only write what the player may know from the start. This is shown in their drawer and recap; leave secrets and future plot here out.">
        <textarea className="text_pole st-input min-h-[4rem]" aria-label="Player introduction" placeholder="A spoiler-safe premise and what the player can expect…" value={draft.player_intro ?? ""}
          onChange={(event) => mutate((current) => setStoryField(current, "player_intro", event.target.value || undefined))} />
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
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          data-so="objective-block"
          checked={draft.objective_block !== "off"}
          onChange={(event) => mutate((current) => setStoryField(current, "objective_block", event.target.checked ? undefined : "off"))}
        />
        Add the objective when a checkpoint has no author note
      </label>
    </div>
  );
};

const RequirementsSection = ({ draft, mutate, personaNames, memberNames, lorebookNames }: { draft: Draft; mutate: Mutate; personaNames: string[]; memberNames: string[]; lorebookNames: string[] }) => {
  const requirements: StoryRequirements = draft.requirements ?? {};
  const patchRequirements = (patch: StoryRequirements) => mutate((current) => setRequirements(current, { ...(current.requirements ?? {}), ...patch }));
  return (
    <div data-so="requirements" className="st-subpanel flex flex-col gap-3 p-3">
      <div className="text-sm font-medium">Requirements <span className="st-muted font-normal">— what the chat must have before the story runs</span></div>
      <RequirementList
        label="Persona"
        hint="The user persona this story is written for. A mismatch shows the player a 'this story still needs' notice instead of silently misfiring."
        values={requirements.personas ?? []}
        options={personaNames}
        listId="so-req-personas"
        onChange={(personas) => patchRequirements({ personas })}
      />
      <RequirementList
        label="Cast member"
        hint="Characters that must be in the group. Names must match the character cards."
        values={requirements.members ?? []}
        options={memberNames}
        listId="so-req-members"
        onChange={(members) => patchRequirements({ members })}
      />
      <RequirementList
        label="Lorebook"
        hint="Lorebooks this story needs. SillyTavern can scan them globally, in this chat's slot, through the persona, or on every enabled cast member."
        values={requirements.lorebooks ?? []}
        options={lorebookNames}
        listId="so-req-lorebooks"
        onChange={(lorebooks) => patchRequirements({ lorebooks })}
      />
    </div>
  );
};

const StagecraftSection = ({ draft, mutate, lorebookNames }: { draft: Draft; mutate: Mutate; lorebookNames: string[] }) => (
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
);

const IllustrationsSection = ({ draft, mutate }: { draft: Draft; mutate: Mutate }) => {
  const art = draft.illustrations;
  const update = (patch: NonNullable<Draft["illustrations"]>) => mutate((current) => setStoryField(current, "illustrations", { ...current.illustrations, ...patch }));
  return <div data-so="story-illustrations" className="st-subpanel flex flex-col gap-3 p-3">
    <div className="text-sm font-medium">Illustrations <span className="st-muted font-normal">— portable story direction</span></div>
    <div className="text-xs st-muted">Choose when this story asks for art. Automatic images also need the install-wide image service enabled; a player can pause them in this chat.</div>
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={art?.checkpoints ?? false} onChange={(event) => update({ checkpoints: event.target.checked })} />At checkpoint changes
    </label>
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={art?.scenes ?? false} onChange={(event) => update({ scenes: event.target.checked })} />At confirmed scene changes
    </label>
    <Field label="Visual direction" hint="Portable artistic direction for the image-prompt model. Model files, LoRAs and ComfyUI addresses belong to this SillyTavern install.">
      <textarea className="text_pole st-input min-h-[4rem]" aria-label="Visual direction" value={art?.style ?? ""}
        placeholder="Lighting, palette and visual mood…" onChange={(event) => update({ style: event.target.value })} />
    </Field>
    {draft.roster.map((member) => <Field key={member.id} label={`${member.name ?? member.id} — appearance`} hint="Appearance the image-prompt model should preserve for this story's cast member.">
      <input className="text_pole st-input" aria-label={`${member.name ?? member.id} appearance`} value={art?.appearances?.[member.id] ?? ""}
        onChange={(event) => update({ appearances: { ...art?.appearances, [member.id]: event.target.value } })} />
    </Field>)}
  </div>;
};

const LoreSelectSection = ({ draft, mutate, lorebookNames }: { draft: Draft; mutate: Mutate; lorebookNames: string[] }) => (
  <div data-so="lore-select-field" className="st-subpanel flex flex-col gap-3 p-3">
    <div className="text-sm font-medium">Lore-select <span className="st-muted font-normal">— lorebooks the judge may pick entries from each turn</span></div>
    <RequirementList
      label="Lore-select lorebook"
      hint={"When the player's install turns lore-select on, each generation asks the judge which entries of these books the next reply needs, and forces the top few for that " +
        "one generation. It never edits a book. Entry titles and text are sent to the judgment service. List only books this story requires: an inactive book is never scanned."}
      values={draft.lore_select?.lorebooks ?? []}
      options={lorebookNames}
      listId="so-lore-select-lorebooks"
      onChange={(lorebooks) => mutate((current) => setLoreSelect(current, { ...current.lore_select, lorebooks }))}
    />
    {draft.lore_select ? (
      <div className="flex items-center gap-2 text-sm">
        <label htmlFor="so-lore-top-k" className="text-xs st-muted">Entries forced per turn</label>
        <input
          className="text_pole st-input w-20"
          id="so-lore-top-k"
          type="number"
          min={1}
          max={12}
          aria-label="Entries forced per turn"
          value={draft.lore_select.top_k ?? ""}
          placeholder="4"
          onChange={(event) => mutate((current) => setLoreSelect(
            current,
            { ...(current.lore_select ?? { lorebooks: [] }), top_k: event.target.value === "" ? undefined : Number(event.target.value) },
          ))}
        />
        <HelpTooltip title={"1 to 12, default 4. Forced entries still compete for ST's World Info budget; give an " +
          "entry probability 100 if it must survive."} />
      </div>
    ) : null}
    {draft.lore_select ? (
      <div className="flex items-center gap-2 text-sm">
        <input
          data-so="lore-select-exclusive"
          id="so-lore-exclusive"
          type="checkbox"
          aria-label="Exclude unpicked entries"
          checked={Boolean(draft.lore_select.exclusive)}
          onChange={(event) => mutate((current) => setLoreSelect(current, { ...(current.lore_select ?? { lorebooks: [] }), exclusive: event.target.checked }))}
        />
        <label className="text-xs st-muted" htmlFor="so-lore-exclusive">Exclude unpicked entries</label>
        <HelpTooltip title={"Only when the player's install turns on Exclusive lore selection and gates lore per chat: " +
          "the entries of these books the judge did not pick are switched off for that one reply. Constant, checkpoint-gated and timed entries are never switched off, and a " +
          "timeout keeps the ordinary keyword scan."} />
      </div>
    ) : null}
  </div>
);

const HouseRulesSection = ({ draft, mutate }: { draft: Draft; mutate: Mutate }) => (
  <div data-so="house-rules" className="st-subpanel flex flex-col gap-3 p-3">
    <div className="text-sm font-medium">House rules <span className="st-muted font-normal">— what every character reply is held to</span></div>
    <RequirementList
      label="House rule"
      hint={"Sent to the judgment model with each character reply, only when House rules is on. One demand per rule, stated so a reply either keeps it or breaks it; a broken " +
        "rule is named in the next reply's prompt."}
      values={draft.house_rules ?? []}
      options={[]}
      listId="so-house-rules"
      max={HOUSE_RULES_MAX}
      onChange={(rules) => mutate((current) => setHouseRules(current, rules))}
    />
  </div>
);

const SceneReadSection = ({ draft, mutate }: { draft: Draft; mutate: Mutate }) => {
  const locationOptions = draft.qualities.find((quality) => quality.key === "location" && quality.type === "enum")?.values ?? [];
  return (
    <div data-so="scene-read-field" className="st-subpanel flex flex-col gap-3 p-3">
      <div className="text-sm font-medium">Scene read <span className="st-muted font-normal">— places and times the scene tracker may pick from</span></div>
      <RequirementList
        label="Place"
        hint={"The judge can only pick a place from this list; it never invents one. Empty uses the values of an enum quality keyed 'location', and with neither the tracker " +
          "never says where the scene is."}
        values={draft.scene_read?.locations ?? []}
        options={locationOptions}
        listId="so-scene-read-locations"
        onChange={(locations) => mutate((current) => setSceneRead(current, { ...current.scene_read, locations }))}
      />
      <RequirementList
        label="Time of day"
        hint="Leave empty for dawn, morning, midday, afternoon, evening and night."
        values={draft.scene_read?.times ?? []}
        options={[]}
        listId="so-scene-read-times"
        onChange={(times) => mutate((current) => setSceneRead(current, { ...current.scene_read, times }))}
      />
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={draft.scene_read?.inject !== false}
          onChange={(event) => mutate((current) => setSceneRead(current, { ...current.scene_read, inject: event.target.checked }))}
        />
        Add the scene line to the prompt when the player's scene tracker is on
      </label>
    </div>
  );
};

const ArcBridgesSection = ({ draft, mutate }: { draft: Draft; mutate: Mutate }) => {
  const anchors = draft.checkpoints.filter((checkpoint) => checkpoint.type === "anchor");
  const bridges = draft.arc_bridges ?? [];
  return (
    <div data-so="arc-bridges" className="st-subpanel flex flex-col gap-2 p-3">
      <div className="text-sm font-medium">Thread bridges <span className="st-muted font-normal">— resolved story threads that feed convergence</span></div>
      {bridges.length === 0 ? <div className="text-xs st-muted">None. Add one to have a resolved thread whose text matches the keyword push progress toward an anchor.</div> : null}
      {bridges.map((bridge, index) => (
        <div key={index} className="flex flex-wrap items-end gap-2">
          <label className="flex flex-1 flex-col gap-1 text-sm">
            <span className="text-xs st-muted">Thread keyword</span>
            <input
              className="text_pole st-input"
              aria-label={`Bridge ${index + 1} keyword`}
              value={bridge.arcMatch}
              onChange={(event) => mutate((current) => updateArcBridge(current, index, { arcMatch: event.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs st-muted">Anchor</span>
            <select
              className="text_pole st-input"
              aria-label={`Bridge ${index + 1} anchor`}
              value={bridge.anchor}
              onChange={(event) => mutate((current) => updateArcBridge(current, index, { anchor: event.target.value }))}
            >
              <option value="" disabled>anchor…</option>
              {anchors.map((anchor) => <option key={anchor.id} value={anchor.id}>{anchor.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs st-muted">Progress</span>
            <input
              type="number"
              step={0.5}
              className="text_pole st-input w-24"
              aria-label={`Bridge ${index + 1} amount`}
              value={bridge.amount}
              onChange={(event) => mutate((current) => updateArcBridge(current, index, { amount: Number(event.target.value) || 0 }))}
            />
          </label>
          <button type="button" className="st-button danger" aria-label={`Remove bridge ${index + 1}`} onClick={() => mutate((current) => removeArcBridge(current, index))}>×</button>
        </div>
      ))}
      <button type="button" className="st-button secondary self-start" disabled={!anchors.length} onClick={() => mutate((current) => addArcBridge(current))}>+ Bridge</button>
    </div>
  );
};

const StoryEditor: React.FC<StoryEditorProps> = ({ personaNames = [], memberNames = [], lorebookNames = [], idLocked = false }) => {
  const draft = useDraftStore((state) => state.draft);
  const mutate = useDraftStore((state) => state.mutate);

  return (
    <div data-so="story" className="flex flex-col gap-4">
      <StoryIdentitySection draft={draft} mutate={mutate} idLocked={idLocked} />
      <RequirementsSection draft={draft} mutate={mutate} personaNames={personaNames} memberNames={memberNames} lorebookNames={lorebookNames} />
      <IllustrationsSection draft={draft} mutate={mutate} />
      <StagecraftSection draft={draft} mutate={mutate} lorebookNames={lorebookNames} />
      <LoreSelectSection draft={draft} mutate={mutate} lorebookNames={lorebookNames} />
      <HouseRulesSection draft={draft} mutate={mutate} />
      <SceneReadSection draft={draft} mutate={mutate} />
      <ArcBridgesSection draft={draft} mutate={mutate} />
      <ChaptersEditor />
    </div>
  );
};

export default StoryEditor;
