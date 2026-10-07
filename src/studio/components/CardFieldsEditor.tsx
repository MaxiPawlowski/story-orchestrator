import React, { useState } from "react";
import type { CardBinding, Quality, RosterMember, StoryV2 } from "@engine/index";
import { boundCardQualities, cardQualityEligible } from "@engine/cardFields";
import HelpTooltip from "@components/studio/HelpTooltip";

const FieldId: React.FC<{ index: number; name: string; onCommit: (next: string) => void }> = ({ index, name, onCommit }) => {
  const [text, setText] = useState(name);
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs st-muted">Field id</span>
      <input
        className="text_pole st-input"
        aria-label={`Field ${index + 1} id`}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => onCommit(text.trim())}
      />
    </label>
  );
};

// A card field binds one of a story entity's qualities to the character card, so a change in play can
// rewrite the card the model reads. Only a non-latching extractor string or enum may bind, and a
// quality may bind to one field across the whole cast, the same rules the story validator enforces.
const CardFieldsEditor: React.FC<{
  card: CardBinding | undefined;
  qualities: Quality[];
  roster: RosterMember[];
  player: StoryV2["player"];
  onChange: (card: CardBinding | undefined) => void;
}> = ({ card, qualities, roster, player, onChange }) => {
  const fields = card?.fields ?? {};
  const eligible = qualities.filter(cardQualityEligible);
  const bound = boundCardQualities(roster, player);
  const selectable = (name: string) => eligible.filter((quality) => !bound.has(quality.key) || fields[name]?.quality === quality.key);
  const put = (name: string, binding: { quality: string; visual?: boolean }) => onChange({ fields: { ...fields, [name]: binding } });
  const remove = (name: string) => {
    const next = { ...fields };
    delete next[name];
    onChange(Object.keys(next).length ? { fields: next } : undefined);
  };
  const rename = (from: string, to: string) => {
    if (!to || to === from || fields[to] || !/^[a-z][a-z0-9_]{0,39}$/.test(to)) return;
    const next = { ...fields };
    next[to] = next[from];
    delete next[from];
    onChange({ fields: next });
  };
  const add = () => {
    const quality = eligible.find((candidate) => !bound.has(candidate.key));
    if (!quality) return;
    let name = "field", suffix = 2;
    while (fields[name]) name = `field_${suffix++}`;
    put(name, { quality: quality.key });
  };
  return (
    <div data-so="card-fields" className="flex basis-full flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="st-button secondary px-2 py-0.5 text-xs" disabled={!eligible.length} onClick={add}>+ Card field</button>
        <span className="text-xs st-muted">Card fields <HelpTooltip title={"Binds one of this character's qualities to their card, so the story can change how they " +
          "look or read as play moves. Only an extracted string or enum that does not latch can bind, and a quality binds to one field across the whole cast. " +
          "A field marked 'changes the picture' is used for on-demand sprite looks."} /></span>
      </div>
      {!eligible.length && <p className="text-xs st-muted">Add a non-latching extractor string or enum quality first; a card field binds one of those.</p>}
      {Object.entries(fields).map(([name, binding], index) => (
        <div key={name} className="st-subpanel flex flex-wrap items-end gap-2 p-2">
          <FieldId index={index} name={name} onCommit={(next) => rename(name, next)} />
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs st-muted">Quality</span>
            <select className="text_pole st-input" aria-label={`Field ${index + 1} quality`} value={binding.quality}
              onChange={(event) => put(name, { ...binding, quality: event.target.value })}>
              {selectable(name).map((quality) => <option key={quality.key} value={quality.key}>{quality.key}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1 text-xs st-muted">
            <input type="checkbox" aria-label={`Field ${index + 1} changes the picture`} checked={binding.visual === true}
              onChange={(event) => put(name, { ...binding, visual: event.target.checked || undefined })} />
            changes the picture
          </label>
          <button type="button" className="st-button danger" aria-label={`Remove field ${index + 1}`} onClick={() => remove(name)}>×</button>
        </div>
      ))}
    </div>
  );
};

export default CardFieldsEditor;
