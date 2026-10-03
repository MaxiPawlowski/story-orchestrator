import React from "react";
import { BRIEFING_MAX_SECTIONS, BRIEFING_SECTION_MAX_CHARS, type BriefingSection, type StoryBriefing } from "@engine/index";
import HelpTooltip from "@components/studio/HelpTooltip";

export interface BriefingEditorProps {
  briefing?: StoryBriefing;
  name: string;
  hint: string;
  onChange: (next: StoryBriefing | undefined) => void;
  onPreview?: () => void;
}

const HOW_TO_PLAY: BriefingSection = { heading: "How to play", text: "Write what you do and say; the world answers." };

const tidy = (briefing: StoryBriefing): StoryBriefing | undefined => {
  const kept = Object.fromEntries(Object.entries(briefing).filter(([key, value]) => key === "sections" || (typeof value === "string" && value !== ""))) as StoryBriefing;
  return kept.sections.length || Object.keys(kept).length > 1 ? kept : undefined;
};

export const BriefingEditor: React.FC<BriefingEditorProps> = ({ briefing, name, hint, onChange, onPreview }) => {
  const current: StoryBriefing = briefing ?? { sections: [] };
  const update = (patch: Partial<StoryBriefing>) => onChange(tidy({ ...current, ...patch }));
  const setSection = (index: number, patch: Partial<BriefingSection>) =>
    update({ sections: current.sections.map((section, at) => (at === index ? { ...section, ...patch } : section)) });
  const line = (key: "title" | "tone" | "image" | "start_label", label: string, placeholder: string) => (
    <label className="flex flex-1 flex-col gap-1 text-sm">
      <span className="text-xs st-muted">{label}</span>
      <input className="text_pole st-input" aria-label={`${name} ${label.toLowerCase()}`} placeholder={placeholder} value={current[key] ?? ""}
        onChange={(event) => update({ [key]: event.target.value })} />
    </label>
  );
  return (
    <div data-so="briefing-editor" className="st-subpanel flex flex-col gap-2 p-2">
      <div className="text-sm font-medium">{name}<HelpTooltip title={hint} /></div>
      <div className="flex flex-wrap gap-2">
        {line("title", "Title", "The story's title")}
        {line("start_label", "Button", "Begin")}
      </div>
      <div className="flex flex-wrap gap-2">
        {line("tone", "Tone", "Dark fantasy, mature themes.")}
        {line("image", "Picture", "A background file name")}
      </div>
      {current.sections.map((section, index) => (
        <div key={index} data-so="briefing-editor-section" className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <input className="text_pole st-input flex-1" aria-label={`${name} section ${index + 1} heading`} placeholder="Who you are" value={section.heading}
              onChange={(event) => setSection(index, { heading: event.target.value })} />
            <button type="button" className="st-button danger" aria-label={`Remove ${name} section ${index + 1}`}
              onClick={() => update({ sections: current.sections.filter((_, at) => at !== index) })}>×</button>
          </div>
          <textarea className="text_pole st-input min-h-[4rem]" aria-label={`${name} section ${index + 1} text`} maxLength={BRIEFING_SECTION_MAX_CHARS} value={section.text}
            placeholder="What the player may know when this shows. A blank line starts a new paragraph."
            onChange={(event) => setSection(index, { text: event.target.value })} />
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="st-button secondary" disabled={current.sections.length >= BRIEFING_MAX_SECTIONS}
          onClick={() => update({ sections: [...current.sections, current.sections.length ? { heading: "", text: "" } : HOW_TO_PLAY] })}>+ Section</button>
        <span data-so="list-count" className="text-xs st-muted">{current.sections.length}/{BRIEFING_MAX_SECTIONS}</span>
        {onPreview && <button type="button" data-so="briefing-preview" className="st-button secondary" onClick={onPreview}>Preview briefing</button>}
      </div>
    </div>
  );
};

export default BriefingEditor;
