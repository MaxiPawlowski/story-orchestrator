import React, { useState } from "react";
import { DELIVERY_CAPS, DELIVERY_RHYTHMS, MOOD_DEFAULT_VALUES, type RosterMember, type RosterPolish } from "@engine/index";
import HelpTooltip from "@components/studio/HelpTooltip";
import { useDraftStore } from "../draft";
import { setMemberPolish, type PolishPatch } from "../deliveryMutations";

const HELP = "How this character words things, told only to them before they speak. It never changes what happens or what they know. "
  + "Record only what the card already shows; leave a field empty rather than invent a trait.";

const NOTES_HELP = "Register, sentence habits, what they never say aloud. Wording only: no facts, plans or secrets, nothing about the player.";

type ListKey = "prefer" | "avoid" | "tics";

const LISTS: Array<{ key: ListKey; label: string; help: string; placeholder: string }> = [
  { key: "prefer", label: "Words that are theirs", help: "Words and turns of phrase this character uses.", placeholder: "e.g. mind the rope" },
  { key: "avoid", label: "Words they would not use", help: "Told to the character as words to say their own way instead. Never a name.", placeholder: "e.g. indeed" },
  {
    key: "tics", label: "Habits to watch", placeholder: "e.g. smirks",
    help: "Model habits you have seen in their replies ('smirks'). Named back to the character when they show in two of their last six replies.",
  },
];

const ChipList = ({ name, label, help, placeholder, items, max, onChange }: {
  name: string; label: string; help: string; placeholder: string; items: string[]; max: number; onChange: (items: string[]) => void;
}) => {
  const [text, setText] = useState("");
  const add = () => {
    const value = text.trim();
    if (value && !items.some((item) => item.toLowerCase() === value.toLowerCase()) && items.length < max) onChange([...items, value]);
    setText("");
  };
  return (
    <div className="flex basis-full flex-col gap-1 text-sm">
      <span className="text-xs st-muted">{label} <HelpTooltip title={help} /></span>
      <div className="flex flex-wrap items-center gap-1">
        {items.map((item) => (
          <span key={item} className="st-pill flex items-center gap-1 px-2 py-0.5 text-[11px]">
            {item}
            <button type="button" className="st-button danger px-1" aria-label={`Remove ${name} ${label} ${item}`} onClick={() => onChange(items.filter((entry) => entry !== item))}>×</button>
          </span>
        ))}
        <input
          className="text_pole st-input min-w-0 flex-1"
          aria-label={`${name} ${label}`}
          placeholder={items.length >= max ? `at most ${max}` : placeholder}
          disabled={items.length >= max}
          maxLength={40}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); add(); } }}
          onBlur={add}
        />
      </div>
    </div>
  );
};

const moodsOf = (member: RosterMember): string[] => (member.mood ? member.mood.values?.length ? member.mood.values : [...MOOD_DEFAULT_VALUES] : []);

const MemberSheet = ({ member }: { member: RosterMember }) => {
  const mutate = useDraftStore((state) => state.mutate);
  const polish: RosterPolish = member.polish ?? {};
  const name = member.name || member.id;
  const patch = (value: PolishPatch) => mutate((current) => setMemberPolish(current, member.id, value));
  const moods = moodsOf(member);
  return (
    <li data-so="delivery-member" data-member={member.id} className="st-subpanel flex flex-wrap items-end gap-2 p-2">
      <span className="st-pill px-2 py-0.5 text-[11px]">{name}</span>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" aria-label={`${name} voice sheet on`} checked={polish.enabled !== false} onChange={(event) => patch({ enabled: event.target.checked })} />
        <span className="text-xs st-muted">On</span>
      </label>
      <label className="flex basis-full flex-col gap-1 text-sm">
        <span className="text-xs st-muted">How they talk <HelpTooltip title={NOTES_HELP} /></span>
        <textarea
          className="text_pole st-input"
          aria-label={`${name} voice notes`}
          rows={2}
          maxLength={DELIVERY_CAPS.notes}
          placeholder="optional — e.g. Short sentences. Talks in river terms."
          value={polish.notes ?? ""}
          onChange={(event) => patch({ notes: event.target.value || undefined })}
        />
      </label>
      {LISTS.map((list) => (
        <ChipList key={list.key} name={name} label={list.label} help={list.help} placeholder={list.placeholder} items={polish[list.key] ?? []}
          max={DELIVERY_CAPS[list.key].items} onChange={(items) => patch({ [list.key]: items })} />
      ))}
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs st-muted">Rhythm</span>
        <select aria-label={`${name} rhythm`} value={polish.rhythm ?? ""} onChange={(event) => patch({ rhythm: (event.target.value || undefined) as RosterPolish["rhythm"] })}>
          <option value="">Not set</option>
          {DELIVERY_RHYTHMS.map((rhythm) => <option key={rhythm} value={rhythm}>{rhythm}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs st-muted">Dialogue (used by reply polish)</span>
        <select aria-label={`${name} dialogue`} value={polish.dialogue ?? "keep"} onChange={(event) => patch({ dialogue: event.target.value as RosterPolish["dialogue"] })}>
          <option value="keep">keep</option>
          <option value="voice">voice</option>
        </select>
      </label>
      {moods.length > 0 && (
        <div data-so="delivery-moods" className="flex basis-full flex-col gap-1">
          <span className="text-xs st-muted">By mood <HelpTooltip title="How they sound in each mood, used while that is their current mood." /></span>
          {moods.map((mood) => (
            <label key={mood} className="flex items-center gap-2 text-sm">
              <span className="w-16 text-xs st-muted">{mood}</span>
              <input
                className="text_pole st-input min-w-0 flex-1"
                aria-label={`${name} delivery when ${mood}`}
                maxLength={DELIVERY_CAPS.byMood}
                placeholder="optional"
                value={polish.by_mood?.[mood] ?? ""}
                onChange={(event) => {
                  const next = { ...(polish.by_mood ?? {}) };
                  if (event.target.value) next[mood] = event.target.value; else delete next[mood];
                  patch({ by_mood: Object.keys(next).length ? next : undefined });
                }}
              />
            </label>
          ))}
        </div>
      )}
    </li>
  );
};

const VoiceDeliveryEditor: React.FC = () => {
  const roster = useDraftStore((state) => state.draft.roster);
  return (
    <div data-so="delivery-editor" className="st-subpanel flex flex-col gap-2 p-2">
      <span className="text-sm font-semibold">Voice and delivery <HelpTooltip title={HELP} /></span>
      {roster.length === 0 ? (
        <span className="text-xs st-muted">Add cast members first.</span>
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Voice and delivery">
          {roster.map((member) => <MemberSheet key={member.id} member={member} />)}
        </ul>
      )}
    </div>
  );
};

export default VoiceDeliveryEditor;
