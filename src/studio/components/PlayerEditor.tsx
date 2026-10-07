import React from "react";
import { PLAYER_ASSUMES_MAX, PLAYER_NAME_MODES, renderPlayerRoleLine, type PlayerNameMode, type StoryPlayer } from "@engine/index";
import HelpTooltip from "@components/studio/HelpTooltip";

export interface PlayerEditorProps {
  player?: StoryPlayer;
  onChange: (next: StoryPlayer | undefined) => void;
}

const HINT = "Who the player plays. Shown at the start, where the player keeps, chooses or creates a persona; the chat then keeps it for the whole story. "
  + "Unless switched off, the reply prompt is told one line: who the player is. Player copy: nothing from later in the story.";

const MODE_LABELS: Record<PlayerNameMode, string> = { any: "Any name", suggested: "Suggest a name", fixed: "Only this name" };

const tidy = (player: StoryPlayer): StoryPlayer | undefined => {
  const kept: StoryPlayer = {
    ...(player.role ? { role: player.role } : {}),
    ...(player.summary ? { summary: player.summary } : {}),
    ...(player.name && (player.name.mode !== "any" || player.name.value) ? { name: player.name } : {}),
    ...(player.assumes?.length ? { assumes: player.assumes } : {}),
    ...(player.suggested_description ? { suggested_description: player.suggested_description } : {}),
    ...(player.inject === false ? { inject: false } : {}),
  };
  return Object.keys(kept).length ? kept : undefined;
};

export const PlayerEditor: React.FC<PlayerEditorProps> = ({ player, onChange }) => {
  const current: StoryPlayer = player ?? {};
  const update = (patch: Partial<StoryPlayer>) => onChange(tidy({ ...current, ...patch }));
  const assumes = current.assumes ?? [];
  const mode = current.name?.mode ?? "any";
  const line = renderPlayerRoleLine(current.role, current.summary);
  return (
    <div data-so="player-editor" className="st-subpanel flex flex-col gap-2 p-2">
      <div className="text-sm font-medium">Who the player is<HelpTooltip title={HINT} /></div>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs st-muted">Role</span>
        <input className="text_pole st-input" aria-label="Player role" placeholder="a hired adventurer" value={current.role ?? ""} onChange={(event) => update({ role: event.target.value })} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs st-muted">Summary</span>
        <textarea className="text_pole st-input min-h-[3rem]" aria-label="Player summary" placeholder="You are new to the city, with a sword and a little coin."
          value={current.summary ?? ""} onChange={(event) => update({ summary: event.target.value })} />
      </label>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs st-muted">Name</span>
          <select className="text_pole st-input" aria-label="Player name mode" value={mode}
            onChange={(event) => update({ name: { mode: event.target.value as PlayerNameMode, ...(current.name?.value ? { value: current.name.value } : {}) } })}>
            {PLAYER_NAME_MODES.map((entry) => <option key={entry} value={entry}>{MODE_LABELS[entry]}</option>)}
          </select>
        </label>
        {mode !== "any" && (
          <input className="text_pole st-input flex-1" aria-label="Player name" placeholder="Name" value={current.name?.value ?? ""}
            onChange={(event) => update({ name: { mode, value: event.target.value } })} />
        )}
      </div>
      <div className="flex flex-col gap-1 text-sm">
        <span className="text-xs st-muted">The story takes for granted</span>
        {assumes.map((entry, index) => (
          <div key={index} className="flex items-center gap-2">
            <input className="text_pole st-input flex-1" aria-label={`Assumption ${index + 1}`} value={entry}
              onChange={(event) => update({ assumes: assumes.map((value, at) => (at === index ? event.target.value : value)) })} />
            <button type="button" className="st-button danger" aria-label={`Remove assumption ${index + 1}`} onClick={() => update({ assumes: assumes.filter((_, at) => at !== index) })}>×</button>
          </div>
        ))}
        <button type="button" className="st-button secondary self-start" disabled={assumes.length >= PLAYER_ASSUMES_MAX} onClick={() => update({ assumes: [...assumes, ""] })}>+ Assumption</button>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs st-muted">Suggested persona description</span>
        <textarea className="text_pole st-input min-h-[3rem]" aria-label="Suggested persona description" value={current.suggested_description ?? ""}
          onChange={(event) => update({ suggested_description: event.target.value })} />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" data-so="player-inject" checked={current.inject !== false} onChange={(event) => update({ inject: event.target.checked ? undefined : false })} />
        Tell the characters who the player is
      </label>
      {line && current.inject !== false && <div data-so="player-line" className="text-xs st-muted">{line}</div>}
    </div>
  );
};

export default PlayerEditor;
