import React from "react";
import type { RosterMember, TalkControl, TalkControlSpeaker } from "@engine/index";
import { directorEnabled, directorInstruction } from "@talk/index";
import HelpTooltip from "@components/studio/HelpTooltip";

const memberLabel = (member: RosterMember) => member.name ?? member.id;

const SpeakerRow: React.FC<{
  speaker: TalkControlSpeaker;
  index: number;
  roster: RosterMember[];
  onChange: (patch: Partial<TalkControlSpeaker>) => void;
  onRemove: () => void;
}> = ({ speaker, index, roster, onChange, onRemove }) => (
  <div className="flex flex-wrap items-center gap-2">
    <select aria-label={`Speaker ${index + 1}`} className="text_pole st-input" value={speaker.member} onChange={(event) => onChange({ member: event.target.value })}>
      <option value="" disabled>member…</option>
      {roster.map((member) => <option key={member.id} value={memberLabel(member)}>{memberLabel(member)}</option>)}
      {speaker.member && !roster.some((member) => memberLabel(member) === speaker.member || member.id === speaker.member) ? <option value={speaker.member}>{speaker.member}</option> : null}
    </select>
    <label className="flex items-center gap-1 text-xs st-muted">
      weight
      <input type="number" min={0.1} step={0.1} className="text_pole st-input w-20" aria-label={`Speaker ${index + 1} weight`} value={speaker.weight ?? ""} placeholder="1" onChange={(event) => {
        const parsed = parseFloat(event.target.value);
        onChange({ weight: Number.isFinite(parsed) && parsed > 0 ? parsed : undefined });
      }} />
    </label>
    <button type="button" className="st-button danger" aria-label={`Remove speaker ${index + 1}`} onClick={onRemove}>×</button>
  </div>
);

const TalkControlEditor: React.FC<{ control: TalkControl | undefined; roster: RosterMember[]; onChange: (next: TalkControl | undefined) => void }> = ({ control, roster, onChange }) => {
  const emit = (next: TalkControl) => {
    const cleaned: TalkControl = { ...next };
    (Object.keys(cleaned) as Array<keyof TalkControl>).forEach((key) => {
      if (cleaned[key] === undefined) delete cleaned[key];
    });
    onChange(cleaned);
  };

  const speakers = control?.speakers ?? [];
  const hasDirector = control ? directorEnabled(control) : false;

  return (
    <div className="st-subpanel flex flex-col gap-2 p-2">
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" checked={control !== undefined} onChange={(event) => onChange(event.target.checked ? {} : undefined)} />
        Talk control
        <HelpTooltip title={"When set, this checkpoint takes over who speaks next in the group: name mentions win, then the optional LLM director, then weighted rules. Swipes, " +
          "quiet passes, and explicit /trigger are never intercepted."} />
      </label>
      {control ? (
        <div className="flex flex-col gap-2 pl-6">
          <div className="flex flex-col gap-1">
            <span className="text-xs st-muted">Speakers (empty = whole roster)</span>
            {speakers.map((speaker, index) => (
              <SpeakerRow
                key={index}
                speaker={speaker}
                index={index}
                roster={roster}
                onChange={(patch) => emit({ ...control, speakers: speakers.map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...patch } : entry)) })}
                onRemove={() => {
                  const next = speakers.filter((_, entryIndex) => entryIndex !== index);
                  emit({ ...control, speakers: next.length ? next : undefined });
                }}
              />
            ))}
            <button
              type="button"
              className="st-button secondary self-start"
              onClick={() => emit({ ...control, speakers: [...speakers, { member: roster[0] ? memberLabel(roster[0]) : "" }] })}
            >+ Speaker</button>
          </div>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs st-muted">Lead speaker</span>
            <select aria-label="Lead speaker" className="text_pole st-input" value={control.lead ?? ""} onChange={(event) => emit({ ...control, lead: event.target.value || undefined })}>
              <option value="">— none —</option>
              {roster.map((member) => <option key={member.id} value={memberLabel(member)}>{memberLabel(member)}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={control.no_repeat !== false} onChange={(event) => emit({ ...control, no_repeat: event.target.checked ? undefined : false })} />
            Avoid repeating the previous speaker
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={hasDirector}
              onChange={(event) => emit({ ...control, director: event.target.checked ? true : undefined, allow_silence: event.target.checked ? control.allow_silence : undefined })}
            />
            LLM director picks the speaker
          </label>
          {hasDirector ? (
            <div className="flex flex-col gap-2 pl-6">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={control.allow_silence === true} onChange={(event) => emit({ ...control, allow_silence: event.target.checked ? true : undefined })} />
                Allow silence (nobody replies)
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs st-muted">Director instruction</span>
                <textarea
                  className="text_pole st-input min-h-[3rem]"
                  aria-label="Director instruction"
                  placeholder="e.g. The hermit only answers direct questions."
                  value={directorInstruction(control) ?? ""}
                  onChange={(event) => emit({ ...control, director: event.target.value.trim() ? { instruction: event.target.value } : true })}
                />
              </label>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

export default TalkControlEditor;
