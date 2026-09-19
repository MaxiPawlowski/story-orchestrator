import React, { useState } from "react";
import { READ_AS_TYPES, type Quality, type QualityCriterion, type QualityReadAs, type QualityRatingLevel } from "@engine/index";
import { buildTypedPlan } from "@judge/index";

// A fixed two-message sample, so the preview shows the exact request shape the runtime builds
// (numbers and names in it become "stated" candidates).
const SAMPLE_WINDOW = [
  { id: 1, speaker: "Narrator", text: "The guild master slides the contract across the table: \"Two hundred and fifty crowns, half up front.\"" },
  { id: 2, speaker: "Player", text: "I sign it and pocket the advance." },
];

const READ_AS_LABELS: Record<QualityReadAs, string> = {
  choice: "Choice — pick one option (bool/enum)",
  stated: "Stated — a number or name the messages say",
  rating: "Rating — a position on described levels",
};

const optionsOf = (quality: Quality) => (quality.type === "bool" ? ["true", "false"] : quality.values ?? []);

const asCriterion = (value: string | QualityCriterion | undefined): QualityCriterion => (typeof value === "string" ? { what: value } : value ?? { what: "" });

// Kept as typed (the parser trims on load), so a space typed mid-word or a "not for" written before
// "means" survives the keystroke; an option with both fields empty drops out.
const keptCriterion = (criterion: QualityCriterion): string | QualityCriterion | null => {
  if (!criterion.what && !criterion.not_for) return null;
  return criterion.not_for ? { what: criterion.what, not_for: criterion.not_for } : criterion.what;
};

// v2.2 plan 06: how the judge reads this quality. Nothing here runs until the install opts in to
// "Every-turn story reads"; a quality without a hint never reaches the judge.
const QualityReadEditor: React.FC<{ quality: Quality; storyTitle: string; checkpoint: { name: string; objective: string } | null; onChange: (patch: Partial<Quality>) => void }> = ({ quality, storyTitle, checkpoint, onChange }) => {
  const [preview, setPreview] = useState(false);
  const fitting = (Object.keys(READ_AS_TYPES) as QualityReadAs[]).filter((readAs) => READ_AS_TYPES[readAs].includes(quality.type));
  const choiceCriteria = quality.criteria && !("levels" in quality.criteria) ? (quality.criteria as Record<string, string | QualityCriterion>) : {};
  const levels: QualityRatingLevel[] = quality.criteria && "levels" in quality.criteria && Array.isArray(quality.criteria.levels) ? (quality.criteria as { levels: QualityRatingLevel[] }).levels : [];

  const setCriterion = (option: string, criterion: QualityCriterion) => {
    const next = { ...choiceCriteria };
    const kept = keptCriterion(criterion);
    if (kept) next[option] = kept;
    else delete next[option];
    onChange({ criteria: Object.keys(next).length ? next : undefined });
  };
  const setLevels = (next: QualityRatingLevel[]) => onChange({ criteria: next.length ? { levels: next } : undefined });
  const plan = preview && quality.read_as ? buildTypedPlan([quality], SAMPLE_WINDOW, { title: storyTitle, checkpointName: checkpoint?.name ?? "", objective: checkpoint?.objective ?? "" }) : null;

  return (
    <div data-so="quality-read" className="flex flex-col gap-2 border-t st-divider pt-3">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs st-muted">Judge reading (optional)</span>
        <select
          className="text_pole st-input"
          aria-label="Judge reading"
          value={quality.read_as ?? ""}
          onChange={(event) => onChange({ read_as: (event.target.value || undefined) as QualityReadAs | undefined, criteria: undefined })}
        >
          <option value="">— read by the story model only —</option>
          {fitting.map((readAs) => <option key={readAs} value={readAs}>{READ_AS_LABELS[readAs]}</option>)}
        </select>
      </label>

      {quality.read_as === "choice" ? (
        <div className="flex flex-col gap-2">
          <span className="text-xs st-muted">What each option means. "Not for" names what does <em>not</em> count as this option; it sits on the option it excludes from.</span>
          {optionsOf(quality).map((option) => {
            const criterion = asCriterion(choiceCriteria[option]);
            return (
              <div key={option} className="grid grid-cols-[6rem_1fr_1fr] items-center gap-2">
                <span className="truncate text-sm">{option}</span>
                <input className="text_pole st-input" aria-label={`${option} means`} placeholder="means…" value={criterion.what} onChange={(event) => setCriterion(option, { ...criterion, what: event.target.value })} />
                <input className="text_pole st-input" aria-label={`${option} not for`} placeholder="not for…" value={criterion.not_for ?? ""} onChange={(event) => setCriterion(option, { ...criterion, not_for: event.target.value })} />
              </div>
            );
          })}
        </div>
      ) : null}

      {quality.read_as === "rating" ? (
        <div className="flex flex-col gap-1">
          <span className="text-xs st-muted">Levels, lowest first. Leave empty to use a rubric that reads "from N (low) to M (high)".</span>
          {levels.map((level, index) => (
            <div key={index} className="flex items-center gap-2">
              <input className="text_pole st-input w-20" type="number" aria-label={`Level ${index + 1} value`} value={level.value} onChange={(event) => setLevels(levels.map((entry, entryIndex) => (entryIndex === index ? { ...entry, value: Number(event.target.value) } : entry)))} />
              <input className="text_pole st-input flex-1" aria-label={`Level ${index + 1} label`} value={level.label} onChange={(event) => setLevels(levels.map((entry, entryIndex) => (entryIndex === index ? { ...entry, label: event.target.value } : entry)))} />
              <button type="button" className="st-button danger" aria-label={`Remove level ${index + 1}`} onClick={() => setLevels(levels.filter((_, entryIndex) => entryIndex !== index))}>×</button>
            </div>
          ))}
          <button type="button" className="st-button secondary self-start" onClick={() => setLevels([...levels, { value: levels.length ? levels[levels.length - 1].value + 1 : 0, label: "" }])}>+ Level</button>
        </div>
      ) : null}

      {quality.read_as ? (
        <div className="flex flex-col gap-1">
          <button type="button" className="st-button secondary self-start" aria-expanded={preview} onClick={() => setPreview((open) => !open)}>{preview ? "Hide request" : "Preview request"}</button>
          {preview ? (
            <pre data-so="quality-read-preview" className="st-subpanel max-h-72 overflow-auto whitespace-pre-wrap p-2 text-[11px]">
              {plan ? JSON.stringify(plan.request, null, 2) : "This hint asks nothing on the sample messages (a stated quality needs a number or name in them, a rating needs levels)."}
            </pre>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

export default QualityReadEditor;
