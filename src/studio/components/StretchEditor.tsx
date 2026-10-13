import React from "react";
import { OPENING_MAX_TURNS, STRETCH_PACES, type CheckpointStretch, type StretchPace } from "@engine/index";
import { arrivalExit, newOpenStretch, newOpening, offArrivalExits, withArrival, withEncounters, withMaxTurns, withOpeningTurns, withPace, withPullAfter, type StretchExit } from "../stretchDraft";

export interface StretchEditorProps {
  anchor?: boolean;
  stretch: CheckpointStretch | undefined;
  exits: StretchExit[];
  hasPlayerText: boolean;
  onChange(next: CheckpointStretch | undefined): void;
}

const PACE_LABELS: Record<StretchPace, string> = { brief: "Brief (a breather)", unhurried: "Unhurried", long: "Long (a journey)" };

const turnCount = (raw: string): number | undefined => {
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
};

function OpeningEditor({ stretch, hasPublicText, onChange }: Pick<StretchEditorProps, "onChange"> & { stretch: CheckpointStretch | undefined; hasPublicText: boolean }) {
  return (
    <div data-so="opening-editor" className="flex flex-col gap-2">
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" data-so="opening-open" checked={Boolean(stretch)}
          onChange={(event) => onChange(event.target.checked ? newOpening() : undefined)} />
        <span>Open opening: no objective line for the first player turns here, then the objective applies</span>
      </label>
      {stretch ? (
        <>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs">
              <span>Pace</span>
              <select data-so="opening-pace" aria-label="Opening pace" className="text_pole st-input" value={stretch.pace}
                onChange={(event) => onChange(withOpeningTurns(withPace(stretch, event.target.value as StretchPace), undefined))}>
                {STRETCH_PACES.map((pace) => <option key={pace} value={pace}>{PACE_LABELS[pace]}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span>Open for (player turns, at most {OPENING_MAX_TURNS})</span>
              <input type="number" min={1} max={OPENING_MAX_TURNS} data-so="opening-turns" aria-label="Open for" className="text_pole st-input" value={stretch.pull_after}
                onChange={(event) => onChange(withOpeningTurns(stretch, turnCount(event.target.value)))} />
            </label>
          </div>
          <div className="text-xs st-muted">
            The first {stretch.pull_after} player turns here carry no task. The story's exits work as usual and nothing moves the party.
          </div>
          {hasPublicText ? (
            <div data-so="opening-player-text" className="text-xs st-muted">The public situation above stays hidden from the player while the opening lasts, then shows as usual.</div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export function StretchEditor({ anchor = false, stretch, exits, hasPlayerText, onChange }: StretchEditorProps) {
  if (anchor) return <OpeningEditor stretch={stretch} hasPublicText={hasPlayerText} onChange={onChange} />;
  const arrival = stretch ? arrivalExit(stretch, exits) : null;
  const sideExits = stretch ? offArrivalExits(stretch, exits) : [];
  return (
    <div data-so="stretch-editor" className="flex flex-col gap-2">
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" data-so="stretch-open" checked={Boolean(stretch)}
          onChange={(event) => onChange(event.target.checked ? newOpenStretch(exits) : undefined)} />
        <span>Open stretch: free play, no objective line, the player leaves by their own move</span>
      </label>
      {stretch ? (
        <>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs">
              <span>Pace</span>
              <select data-so="stretch-pace" aria-label="Stretch pace" className="text_pole st-input" value={stretch.pace}
                onChange={(event) => onChange(withPace(stretch, event.target.value as StretchPace))}>
                {STRETCH_PACES.map((pace) => <option key={pace} value={pace}>{PACE_LABELS[pace]}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span>Pull after (player turns)</span>
              <input type="number" min={1} data-so="stretch-pull-after" aria-label="Pull after" className="text_pole st-input" value={stretch.pull_after}
                onChange={(event) => onChange(withPullAfter(stretch, turnCount(event.target.value)))} />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span>Plain pull at (optional)</span>
              <input type="number" min={stretch.pull_after + 1} data-so="stretch-max-turns" aria-label="Plain pull at" className="text_pole st-input"
                value={stretch.max_turns ?? ""} placeholder="none"
                onChange={(event) => onChange(withMaxTurns(stretch, turnCount(event.target.value)))} />
            </label>
          </div>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" data-so="stretch-encounters" checked={stretch.offer?.includes("encounters") === true}
              onChange={(event) => onChange(withEncounters(stretch, event.target.checked))} />
            <span>Offer encounters: prepare 3 to 5 optional situations the world may put forward once play goes quiet</span>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span>Arrival (the exit whose gate ends the stretch)</span>
            <select data-so="stretch-arrival" aria-label="Arrival exit" className="text_pole st-input" value={arrival ? String(arrival.index) : ""}
              onChange={(event) => {
                const picked = exits.find((exit) => String(exit.index) === event.target.value);
                if (picked) onChange(withArrival(stretch, picked));
              }}>
              <option value="" disabled>{exits.length ? "pick an exit…" : "add a transition from this beat first"}</option>
              {exits.map((exit) => <option key={exit.index} value={exit.index}>to {exit.toName}</option>)}
            </select>
          </label>
          <div className="text-xs st-muted">
            The world starts pulling toward {arrival ? arrival.toName : "the next place"} after {stretch.pull_after} player turns;
            {stretch.max_turns ? ` from ${stretch.max_turns} it presses plainly.` : " it never presses plainly."} It never moves the party.
          </div>
          {sideExits.length ? (
            <div data-so="stretch-side-exits" className="text-xs st-text-error">
              Every exit must use the arrival gate: {sideExits.map((exit) => `to ${exit.toName}`).join(", ")} use another gate and will be refused.
            </div>
          ) : null}
          {hasPlayerText ? (
            <div data-so="stretch-player-text" className="text-xs st-text-error">An open stretch shows its name, never a task: clear the public situation above.</div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export default StretchEditor;
