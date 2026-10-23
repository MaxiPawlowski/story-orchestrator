import React from "react";
import { DELIVERY_CAPS, DELIVERY_RHYTHMS, type NarrationSheet } from "@engine/index";
import { POLISH_MODES, type PolishMode } from "@engine/polishSchema";
import HelpTooltip from "@components/studio/HelpTooltip";
import { useDraftStore } from "../draft";
import { setStoryPolish } from "../deliveryMutations";
import { ChipList } from "./VoiceDeliveryEditor";

const HELP = "Reply polish edits wording, never what happens. When a reply uses a word a character would not use, or a phrase they keep repeating, "
  + "only those sentences are rewritten in their voice and code checks nothing else changed. This build runs in shadow: it records what polish would change and never edits the chat.";

const MODE_LABELS: Record<PolishMode, string> = { shadow: "Shadow: record, never edit the chat", off: "Off for this story" };

const NARRATION_HELP = "The voice of an omniscient narrator that has no voice sheet of its own. Wording only: no plot facts, names or secrets.";

type ListKey = "prefer" | "avoid" | "tics";

const LISTS: Array<{ key: ListKey; label: string; placeholder: string }> = [
  { key: "prefer", label: "Narration words", placeholder: "e.g. tide" },
  { key: "avoid", label: "Words the narration avoids", placeholder: "e.g. suddenly" },
  { key: "tics", label: "Narration habits to watch", placeholder: "e.g. a mix of" },
];

const ReplyPolishEditor: React.FC = () => {
  const polish = useDraftStore((state) => state.draft.polish);
  const narrator = useDraftStore((state) => state.draft.roster.some((member) => member.view === "omniscient"));
  const mutate = useDraftStore((state) => state.mutate);
  const narration: NarrationSheet = polish?.narration ?? {};
  const patchNarration = (patch: Partial<NarrationSheet>) => {
    const next = Object.fromEntries(Object.entries({ ...narration, ...patch }).filter(([, value]) => value !== undefined && !(Array.isArray(value) && !value.length)));
    mutate((current) => setStoryPolish(current, { narration: Object.keys(next).length ? next as NarrationSheet : undefined }));
  };
  return (
    <div data-so="reply-polish-editor" className="st-subpanel flex flex-col gap-2 p-2">
      <span className="text-sm font-semibold">Reply polish <HelpTooltip title={HELP} /></span>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs st-muted">Mode</span>
        <select id="so-studio-polish-mode" aria-label="Reply polish mode" value={polish?.mode ?? ""}
          onChange={(event) => mutate((current) => setStoryPolish(current, { mode: (event.target.value || undefined) as PolishMode | undefined }))}>
          <option value="">Install default</option>
          {POLISH_MODES.map((mode) => <option key={mode} value={mode}>{MODE_LABELS[mode]}</option>)}
        </select>
      </label>
      {narrator ? (
        <div data-so="reply-polish-narration" className="flex flex-col gap-2">
          <span className="text-xs st-muted">Narration voice <HelpTooltip title={NARRATION_HELP} /></span>
          <textarea className="text_pole st-input" aria-label="Narration voice notes" rows={2} maxLength={DELIVERY_CAPS.notes}
            placeholder="optional — e.g. Present tense. Short paragraphs." value={narration.notes ?? ""}
            onChange={(event) => patchNarration({ notes: event.target.value || undefined })} />
          {LISTS.map((list) => (
            <ChipList key={list.key} name="Narration" label={list.label} help={NARRATION_HELP} placeholder={list.placeholder} items={narration[list.key] ?? []}
              max={DELIVERY_CAPS[list.key].items} onChange={(items) => patchNarration({ [list.key]: items })} />
          ))}
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs st-muted">Narration rhythm</span>
            <select aria-label="Narration rhythm" value={narration.rhythm ?? ""} onChange={(event) => patchNarration({ rhythm: (event.target.value || undefined) as NarrationSheet["rhythm"] })}>
              <option value="">Not set</option>
              {DELIVERY_RHYTHMS.map((rhythm) => <option key={rhythm} value={rhythm}>{rhythm}</option>)}
            </select>
          </label>
        </div>
      ) : (
        <span className="text-xs st-muted">A narration voice needs a narrator: a cast member who sees everything (view omniscient).</span>
      )}
    </div>
  );
};

export default ReplyPolishEditor;
