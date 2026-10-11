import React from "react";
import type { Quality } from "@engine/index";

const perValueChoices = (quality: Quality): string[] | null =>
  quality.type === "enum" ? (quality.values ?? []).filter((value) => value.trim()) : quality.type === "bool" ? ["true", "false"] : null;

const compact = (map: Record<string, string>): Quality["commit_evidence"] => {
  const kept = Object.fromEntries(Object.entries(map).filter(([, pattern]) => pattern));
  return Object.keys(kept).length ? kept : undefined;
};

const HINT = "A reading only sets this quality when a line the player wrote, in the window it read, matches without a negation before it (\"we won't take it\" does not) "
  + "and is about the value; an NPC or the narrator saying so never counts. Use it for one-way commitments (taking a posting, swearing an oath) "
  + "so a scene aside can never advance the story.";

const PER_VALUE_HINT = "Each pattern guards only its own value; a value left empty is set by any reading, so a quality can mix a commitment (sworn) with plain actions (fled, fought).";

const QualityCommitEvidence: React.FC<{ quality: Quality; disabled: boolean; patch: (change: Partial<Quality>) => void }> = ({ quality, disabled, patch }) => {
  const choices = perValueChoices(quality);
  const pattern = quality.commit_evidence;
  const perValue = typeof pattern === "object";
  const map = perValue ? pattern : {};
  const togglePerValue = (on: boolean) => {
    if (on) patch({ commit_evidence: compact(Object.fromEntries((choices ?? []).map((value) => [value, typeof pattern === "string" ? pattern : ""]))) ?? {} });
    else patch({ commit_evidence: Object.values(map).find(Boolean) || undefined });
  };
  return (
    <div className="flex flex-col gap-1 text-sm" data-so="quality-commit-evidence-field">
      <span className="text-xs st-muted" id="so-commit-evidence-label">Commitment evidence (regex)</span>
      {choices ? (
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" data-so="quality-commit-evidence-per-value" checked={perValue} disabled={disabled} onChange={(event) => togglePerValue(event.target.checked)} />
          A pattern per value
        </label>
      ) : null}
      {perValue && choices ? (
        choices.map((value) => (
          <span key={value} className="flex items-center gap-2">
            <span className="w-24 truncate text-xs">{value}</span>
            <input
              data-so="quality-commit-evidence-value"
              aria-label={`Commitment evidence for ${value}`}
              className="text_pole st-input flex-1"
              value={map[value] ?? ""}
              disabled={disabled}
              placeholder="leave empty: not a commitment"
              onChange={(event) => patch({ commit_evidence: compact({ ...map, [value]: event.target.value }) ?? {} })}
            />
          </span>
        ))
      ) : (
        <input
          data-so="quality-commit-evidence"
          aria-labelledby="so-commit-evidence-label"
          className="text_pole st-input"
          value={typeof pattern === "string" ? pattern : ""}
          disabled={disabled}
          placeholder="take|accept|sign|I swear"
          onChange={(event) => patch({ commit_evidence: event.target.value || undefined })}
        />
      )}
      <span className="text-[10px] st-muted">{perValue ? `${HINT} ${PER_VALUE_HINT}` : HINT}</span>
    </div>
  );
};

export default QualityCommitEvidence;
